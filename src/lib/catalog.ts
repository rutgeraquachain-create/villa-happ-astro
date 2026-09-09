/**
 * Villa Happ — Catalogus
 *
 * Eén interface voor de rest van de site: levert databaseproducten
 * zodra Supabase gekoppeld is, anders de demo-catalogus.
 * Draait op build-moment (alle shoppagina's zijn geprerenderd).
 *
 * Fail loud in productie: is Supabase wel geconfigureerd maar levert de query
 * een fout óf nul gepubliceerde producten, dan breekt de build. Stil
 * terugvallen op demo-data zou live verkeerde prijzen en voorraad tonen; dat
 * risico nemen we bewust niet. Die tweede tak (nul rijen) viel tot 9 september
 * 2026 wél stil terug.
 *
 * De uitkomst wordt een minuut onthouden. Zonder dat deed elke build 74 keer
 * dezelfde query; zie de toelichting bij `getCatalog` onderaan.
 */

import { getSupabase } from './supabase';
import { DEMO_PRODUCTS, type CatalogProduct } from './demo-products';

export type { CatalogProduct, CatalogVariant } from './demo-products';

interface DbInventory { quantity: number | null; reserved: number | null }
interface DbVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  inventory: DbInventory | DbInventory[] | null;
}
interface DbProduct {
  slug: string;
  name: string;
  price_cents: number;
  short_desc: string | null;
  description: string | null;
  image_url: string | null;
  gallery: string[] | null;
  details: string[] | null;
  note: string | null;
  edition: number | null;
  badge: string | null;
  featured: boolean | null;
  category: string | null;
  product_variants: DbVariant[];
}

/**
 * Villa Happ verkoopt niet met korting: geen doorgestreepte vanaf-prijs en
 * geen sale-badge. `compare_at_cents` lezen we daarom niet meer uit, en een
 * kortingsbadge die nog in de database staat filteren we hier weg. Zo kan
 * een oude rij in `products` nooit alsnog een korting op de site zetten.
 */
const DISCOUNT_BADGE = /sale|korting|voordeel|actie|%/i;

function cleanBadge(badge: string | null): string | undefined {
  if (!badge) return undefined;
  return DISCOUNT_BADGE.test(badge) ? undefined : badge;
}

function variantStock(v: DbVariant): number {
  // Supabase geeft een 1-op-1 relatie soms als object, soms als array
  const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
  if (!inv) return 0;
  return Math.max(0, (inv.quantity || 0) - (inv.reserved || 0));
}

/**
 * De uitkomst van een catalogusquery vertalen naar producten.
 *
 * Dit staat los van het ophalen zodat alle vier de takken toetsbaar zijn.
 * Twee ervan (een fout en een lege uitkomst) doen zich in een gewone build
 * nooit voor, en juist die twee bepalen wat er live komt te staan als het
 * misgaat.
 *
 * WAAROM EEN LEGE UITKOMST NU OOK BREEKT
 * Een mislukte query brak de build al. Nul rijen niet: die viel stil terug op
 * de demo-catalogus, en dan gaan demoprijzen en demo-voorraad live. Het effect
 * is precies wat de invariant in CLAUDE.md wil uitsluiten, alleen bereikt via
 * een andere weg. Zet iemand alle producten op niet-gepubliceerd, of verandert
 * de betekenis van `status`, dan hoort de build te stoppen en niet stilletjes
 * iets anders te verkopen.
 *
 * De prijs daarvan: dit draait ook op de drie serverpagina's die `Base` en dus
 * `Header` gebruiken (bestelling, nieuwsbrief bevestigen en afmelden). Een
 * lege catalogus geeft daar een 500 in plaats van een pagina zonder producten.
 * Dat is bewust: een lege gepubliceerde catalogus is een storing en hoort
 * meteen op te vallen, niet pas als iemand de prijzen naleest.
 */
export function catalogusUitRijen(
  data: unknown[] | null,
  error: { message: string } | null,
  productie: boolean,
): CatalogProduct[] {
  if (error) {
    if (productie) {
      throw new Error(`[catalog] Supabase-query faalde: ${error.message}. Build gestopt zodat er geen demo-data live gaat.`);
    }
    console.warn('[catalog] Supabase-query faalde, dev-fallback naar demo-catalogus:', error.message);
    return DEMO_PRODUCTS;
  }

  if (!data || data.length === 0) {
    if (productie) {
      throw new Error('[catalog] Supabase gaf nul gepubliceerde producten. Build gestopt zodat er geen demo-data live gaat.');
    }
    console.warn('[catalog] Nul gepubliceerde producten, dev-fallback naar demo-catalogus.');
    return DEMO_PRODUCTS;
  }

  return (data as unknown as DbProduct[]).map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.product_variants[0]?.color || '',
    price_cents: p.price_cents,
    short_desc: p.short_desc || '',
    description: p.description || '',
    details: p.details || [],
    images: [p.image_url, ...(p.gallery || [])].filter(Boolean) as string[],
    badge: cleanBadge(p.badge) || (p.featured ? 'Featured' : undefined),
    meta: p.category || '',
    edition: p.edition || undefined,
    note: p.note || undefined,
    variants: p.product_variants.map((v) => ({
      id: v.id,
      size: v.size || 'One size',
      stock: variantStock(v),
      sku: v.sku,
    })),
  }));
}

/**
 * De catalogus wordt per proces onthouden, met een korte houdbaarheid.
 *
 * WAAROM DIT ER IS
 * Gemeten 8 september 2026 in de Supabase-logs: elke build deed 74 keer exact
 * dezelfde catalogusquery, in vier tot elf seconden. Dat is één keer per
 * geprerenderde pagina, want `Header` staat in `Base` en roept `getCatalog()`
 * aan. Vijf producten, 74 volledige ophaalacties.
 *
 * WAAROM MET EEN HOUDBAARHEID EN NIET VOOR ALTIJD
 * Dezelfde functie draait ook op de drie serverpagina's die `Base` gebruiken,
 * en `CartDrawer` kiest zijn cross-sell op `stock > 0`. Een cache zonder
 * vervaldatum zou de voorraad bevriezen zolang een serverless-exemplaar warm
 * blijft, en dat is bij hergebruikte instanties niet te overzien. Een minuut
 * dekt een hele build (de langste klont in de meting was elf seconden) en
 * begrenst de veroudering tijdens het draaien tot iets wat je kunt uitleggen.
 *
 * De belofte wordt bewaard en niet de uitkomst, zodat 74 gelijktijdige
 * aanroepen op één query wachten in plaats van er 74 te starten. Een mislukte
 * belofte wordt meteen weggegooid: anders zou één storing een minuut lang
 * herhaald worden op aanroepers die het opnieuw hadden kunnen proberen.
 */
const CATALOGUS_HOUDBAAR_MS = 60_000;
let catalogusCache: { gezet: number; belofte: Promise<CatalogProduct[]> } | null = null;

/** Alleen voor toetsen: gooit de onthouden catalogus weg. */
export function vergeetCatalogus(): void {
  catalogusCache = null;
}

async function haalCatalogus(): Promise<CatalogProduct[]> {
  const sb = getSupabase();
  if (!sb) return DEMO_PRODUCTS; // bewust niet geconfigureerd (lokaal/demo)

  // Eén query met joins i.p.v. per product losse variant- en voorraadcalls
  const { data, error } = await sb
    .from('products')
    .select('slug, name, price_cents, short_desc, description, image_url, gallery, details, note, edition, badge, featured, category, product_variants(id, sku, size, color, inventory(quantity, reserved))')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  return catalogusUitRijen(data, error, import.meta.env.PROD);
}

export function getCatalog(): Promise<CatalogProduct[]> {
  const nu = Date.now();
  if (catalogusCache && nu - catalogusCache.gezet < CATALOGUS_HOUDBAAR_MS) {
    return catalogusCache.belofte;
  }

  const belofte = haalCatalogus();
  catalogusCache = { gezet: nu, belofte };
  // Een storing hoort niet een minuut lang herhaald te worden.
  belofte.catch(() => { catalogusCache = null; });
  return belofte;
}

export async function getCatalogProduct(slug: string): Promise<CatalogProduct | undefined> {
  const catalog = await getCatalog();
  return catalog.find((p) => p.slug === slug);
}
