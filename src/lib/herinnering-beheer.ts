/**
 * Villa Happ — inzendingen lezen voor het beheerscherm (server-only)
 *
 * WAAROM DE FOTO'S ONDERTEKENDE URL'S KRIJGEN
 * -------------------------------------------
 * De bucket is privé, en dat is geen voorzichtigheid maar een eis. `mag_archief`
 * is een apart vinkje en staat standaard uit, dus hier liggen foto's van mensen
 * die uitdrukkelijk nee zeiden tegen publicatie. Een publieke bucket zou die op
 * een raadbare URL zetten.
 *
 * De links hieronder verlopen na een uur. Dat is ruim voor een beoordelingsronde
 * en kort genoeg dat een gedeelde schermafdruk van de adresbalk niets blijvends
 * weggeeft.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const STATUSSEN = ['nieuw', 'gelezen', 'favoriet', 'winnaar', 'afgewezen'] as const;
export type Status = (typeof STATUSSEN)[number];

export const STATUS_LABEL: Record<Status, string> = {
  nieuw: 'Nieuw',
  gelezen: 'Gelezen',
  favoriet: 'Favoriet',
  winnaar: 'Winnaar',
  afgewezen: 'Doet niet mee',
};

export function isStatus(waarde: unknown): waarde is Status {
  return typeof waarde === 'string' && (STATUSSEN as readonly string[]).includes(waarde);
}

export interface Inzending {
  id: string;
  nummer: string;
  naam: string;
  email: string;
  herinnering: string;
  mag_archief: boolean;
  mag_naam: boolean;
  nieuwsbrief: boolean;
  status: Status;
  created_at: string;
  foto_pad: string | null;
  foto_bytes: number | null;
  /**
   * Gezet als de inzender zijn toestemming introk. De foto is dan uit de opslag
   * en de twee gebruiksvinkjes staan op nee. De rij blijft staan omdat die
   * vastlegt dát er is ingetrokken en wanneer (AVG art. 7 lid 3).
   */
  ingetrokken_op: string | null;
  /** Ondertekende link, een uur geldig. Null als er geen foto is. */
  fotoUrl: string | null;
}

/** Hoe lang een fotolink meegaat. Een uur; zie de toelichting bovenaan. */
const LINK_SECONDEN = 3600;

export async function leesInzendingen(sb: SupabaseClient): Promise<Inzending[]> {
  const { data, error } = await sb
    .from('herinneringen')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[herinnering] Inzendingen lezen mislukte:', error.message);
    return [];
  }

  const rijen = (data || []) as Omit<Inzending, 'fotoUrl'>[];
  const paden = rijen.map((r) => r.foto_pad).filter((p): p is string => !!p);

  /**
   * Alle links in één aanroep. Per rij ondertekenen zou bij vijftig inzendingen
   * vijftig heen-en-weertjes kosten, en dan wacht het scherm merkbaar.
   */
  const urls = new Map<string, string>();
  if (paden.length) {
    const { data: ondertekend, error: fout } = await sb.storage
      .from('herinneringen')
      .createSignedUrls(paden, LINK_SECONDEN);
    if (fout) {
      console.error('[herinnering] Fotolinks maken mislukte:', fout.message);
    } else {
      for (const item of ondertekend || []) {
        if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
      }
    }
  }

  return rijen.map((r) => ({
    ...r,
    status: isStatus(r.status) ? r.status : 'nieuw',
    fotoUrl: r.foto_pad ? urls.get(r.foto_pad) ?? null : null,
  }));
}

export interface Kerncijfers {
  totaal: number;
  metFoto: number;
  favoriet: number;
  nieuw: number;
  /** Hoeveel inzenders hun foto in het archief laten gebruiken. */
  magArchief: number;
}

export function kerncijfers(rijen: Inzending[]): Kerncijfers {
  return {
    totaal: rijen.length,
    metFoto: rijen.filter((r) => !!r.foto_pad).length,
    favoriet: rijen.filter((r) => r.status === 'favoriet' || r.status === 'winnaar').length,
    nieuw: rijen.filter((r) => r.status === 'nieuw').length,
    magArchief: rijen.filter((r) => r.mag_archief).length,
  };
}

/**
 * Sorteren voor de beoordeling: wat aandacht vraagt bovenaan.
 *
 * Nieuw eerst, dan favorieten, dan de rest. Binnen elke groep het nieuwste
 * bovenaan. Inzendingen zonder foto zakken binnen hun groep, want die dingen
 * niet mee naar de prijs en hoeven dus niet vooraan.
 */
const RANG: Record<Status, number> = {
  nieuw: 0, favoriet: 1, winnaar: 2, gelezen: 3, afgewezen: 4,
};

export function sorteer(rijen: Inzending[]): Inzending[] {
  return [...rijen].sort((a, b) => {
    if (RANG[a.status] !== RANG[b.status]) return RANG[a.status] - RANG[b.status];
    const fotoA = a.foto_pad ? 0 : 1;
    const fotoB = b.foto_pad ? 0 : 1;
    if (fotoA !== fotoB) return fotoA - fotoB;
    return b.created_at.localeCompare(a.created_at);
  });
}
