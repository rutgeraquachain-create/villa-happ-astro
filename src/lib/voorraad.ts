/**
 * Villa Happ — voorraadlogica
 *
 * De rekenregels staan hier als pure functies, los van de database, zodat ze
 * te testen zijn zonder omgeving en zodat het scherm en de API dezelfde
 * uitkomst geven.
 *
 * Waarom een mutatie en geen absolute stand
 * -----------------------------------------
 * Je vult `+12` of `-1` in, niet "het zijn er nu 14". Tussen het laden van
 * het scherm en het opslaan kan een klant afrekenen. Zet je dan een vast
 * getal neer, dan overschrijf je die bestelling zonder het te zien: je las
 * 14, de klant kocht er een, en jij schrijft 14 terug. Met een verschil kan
 * dat niet, want het optellen gebeurt in de database zelf.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface VoorraadRij {
  variantId: string;
  productSlug: string;
  productNaam: string;
  variantLabel: string;
  sku: string;
  aantal: number;
  gereserveerd: number;
  drempel: number;
}

/** Wat een klant nu nog kan kopen. */
export function vrijVerkoopbaar(rij: Pick<VoorraadRij, 'aantal' | 'gereserveerd'>): number {
  return Math.max(0, rij.aantal - rij.gereserveerd);
}

export type Voorraadstaat = 'uitverkocht' | 'bijna-op' | 'op-voorraad';

/**
 * De staat kijkt naar wat vrij verkoopbaar is, niet naar wat er ligt. Tien
 * stuks waarvan er negen gereserveerd zijn is voor een klant hetzelfde als
 * één stuk, en dat is precies wanneer je wilt bijbestellen.
 */
export function staatVan(rij: Pick<VoorraadRij, 'aantal' | 'gereserveerd' | 'drempel'>): Voorraadstaat {
  const vrij = vrijVerkoopbaar(rij);
  if (vrij === 0) return 'uitverkocht';
  if (vrij <= rij.drempel) return 'bijna-op';
  return 'op-voorraad';
}

export const STAAT_LABEL: Record<Voorraadstaat, string> = {
  uitverkocht: 'Uitverkocht',
  'bijna-op': 'Bijna op',
  'op-voorraad': 'Op voorraad',
};

/** Voor de badge-kleuren in het beheer; zelfde tonen als bij orders. */
export const STAAT_TOON: Record<Voorraadstaat, string> = {
  uitverkocht: 'stop',
  'bijna-op': 'wacht',
  'op-voorraad': 'goed',
};

/** Wat aandacht vraagt komt bovenaan; daarbinnen op naam, zodat de volgorde
 *  niet verspringt zodra er iets verkocht wordt. */
const RANG: Record<Voorraadstaat, number> = { uitverkocht: 0, 'bijna-op': 1, 'op-voorraad': 2 };

export function sorteerVoorraad(rijen: VoorraadRij[]): VoorraadRij[] {
  return [...rijen].sort((a, b) => {
    const r = RANG[staatVan(a)] - RANG[staatVan(b)];
    if (r !== 0) return r;
    const p = a.productNaam.localeCompare(b.productNaam, 'nl');
    if (p !== 0) return p;
    return a.variantLabel.localeCompare(b.variantLabel, 'nl', { numeric: true });
  });
}

export interface Kerncijfers {
  varianten: number;
  uitverkocht: number;
  bijnaOp: number;
  stuksTotaal: number;
  stuksGereserveerd: number;
}

export function kerncijfers(rijen: VoorraadRij[]): Kerncijfers {
  return {
    varianten: rijen.length,
    uitverkocht: rijen.filter((r) => staatVan(r) === 'uitverkocht').length,
    bijnaOp: rijen.filter((r) => staatVan(r) === 'bijna-op').length,
    stuksTotaal: rijen.reduce((n, r) => n + r.aantal, 0),
    stuksGereserveerd: rijen.reduce((n, r) => n + r.gereserveerd, 0),
  };
}

/**
 * Leest de invoer van het correctieveld.
 *
 * Toegestaan: `+12`, `-1`, `12`. Een getal zonder teken telt als bijboeken,
 * want dat is verreweg het vaakst wat je doet als er een doos binnenkomt.
 * Nul is geen mutatie en wordt geweigerd, anders schrijf je een lege regel
 * in het logboek.
 */
export function leesMutatie(invoer: string): number | null {
  const s = (invoer ?? '').trim().replace(/\s+/g, '');
  if (!/^[+-]?\d{1,5}$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n === 0) return null;
  return n;
}

/**
 * Mag deze mutatie? Afboeken tot onder wat gereserveerd is kan niet: die
 * stuks zijn aan een bestelling toegezegd en die moet je nog kunnen leveren.
 * De database bewaakt dit ook, maar hier kan het scherm het al zeggen
 * voordat er iets wordt verstuurd.
 */
export function mutatieToegestaan(
  rij: Pick<VoorraadRij, 'aantal' | 'gereserveerd'>,
  verschil: number,
): { ok: true } | { ok: false; reden: string } {
  const nieuw = rij.aantal + verschil;
  if (nieuw < 0) {
    return { ok: false, reden: `Dat brengt de voorraad op ${nieuw}. Minder dan nul kan niet.` };
  }
  if (nieuw < rij.gereserveerd) {
    return {
      ok: false,
      reden:
        `Er staan ${rij.gereserveerd} stuks gereserveerd voor lopende bestellingen. ` +
        `Je kunt niet onder dat aantal afboeken.`,
    };
  }
  return { ok: true };
}

/* ---------- Database ---------- */

export async function leesVoorraad(sb: SupabaseClient): Promise<VoorraadRij[]> {
  const { data, error } = await sb
    .from('inventory')
    .select('variant_id, quantity, reserved, low_stock_at, product_variants(sku, size, color, products(slug, name))');

  if (error || !data) return [];

  return (data as any[]).map((r) => {
    const v = r.product_variants ?? {};
    const p = v.products ?? {};
    return {
      variantId: r.variant_id,
      productSlug: p.slug ?? '',
      productNaam: p.name ?? 'Onbekend product',
      variantLabel: [v.color, v.size].filter(Boolean).join(' / ') || 'Standaard',
      sku: v.sku ?? '',
      aantal: r.quantity ?? 0,
      gereserveerd: r.reserved ?? 0,
      drempel: r.low_stock_at ?? 5,
    };
  });
}

export interface MutatieRegel {
  variantLabel: string;
  productNaam: string;
  verschil: number;
  standNa: number;
  reden: string;
  wanneer: string;
}

export async function leesMutaties(sb: SupabaseClient, limiet = 25): Promise<MutatieRegel[]> {
  const { data } = await sb
    .from('voorraad_mutaties')
    .select('verschil, stand_na, reden, created_at, product_variants(size, color, products(name))')
    .order('created_at', { ascending: false })
    .limit(limiet);

  return ((data as any[]) ?? []).map((r) => {
    const v = r.product_variants ?? {};
    const p = v.products ?? {};
    return {
      productNaam: p.name ?? 'Onbekend',
      variantLabel: [v.color, v.size].filter(Boolean).join(' / ') || 'Standaard',
      verschil: r.verschil,
      standNa: r.stand_na,
      reden: r.reden,
      wanneer: r.created_at,
    };
  });
}
