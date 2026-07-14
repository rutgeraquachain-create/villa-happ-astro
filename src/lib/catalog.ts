/**
 * Villa Happ — Catalogus
 *
 * Eén interface voor de rest van de site: levert databaseproducten
 * zodra Supabase gekoppeld is, anders de demo-catalogus.
 * Draait op build-moment (alle shoppagina's zijn geprerenderd).
 *
 * Fail loud in productie: is Supabase wel geconfigureerd maar faalt de
 * query, dan breekt de build. Stil terugvallen op demo-data zou live
 * verkeerde prijzen en voorraad tonen; dat risico nemen we bewust niet.
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
  compare_at_cents: number | null;
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

function variantStock(v: DbVariant): number {
  // Supabase geeft een 1-op-1 relatie soms als object, soms als array
  const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
  if (!inv) return 0;
  return Math.max(0, (inv.quantity || 0) - (inv.reserved || 0));
}

export async function getCatalog(): Promise<CatalogProduct[]> {
  const sb = getSupabase();
  if (!sb) return DEMO_PRODUCTS; // bewust niet geconfigureerd (lokaal/demo)

  // Eén query met joins i.p.v. per product losse variant- en voorraadcalls
  const { data, error } = await sb
    .from('products')
    .select('slug, name, price_cents, compare_at_cents, short_desc, description, image_url, gallery, details, note, edition, badge, featured, category, product_variants(id, sku, size, color, inventory(quantity, reserved))')
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) {
    if (import.meta.env.PROD) {
      throw new Error(`[catalog] Supabase-query faalde: ${error.message}. Build gestopt zodat er geen demo-data live gaat.`);
    }
    console.warn('[catalog] Supabase-query faalde, dev-fallback naar demo-catalogus:', error.message);
    return DEMO_PRODUCTS;
  }
  if (!data || data.length === 0) return DEMO_PRODUCTS;

  return (data as unknown as DbProduct[]).map((p) => ({
    slug: p.slug,
    name: p.name,
    color: p.product_variants[0]?.color || '',
    price_cents: p.price_cents,
    compare_at_cents: p.compare_at_cents || undefined,
    short_desc: p.short_desc || '',
    description: p.description || '',
    details: p.details || [],
    images: [p.image_url, ...(p.gallery || [])].filter(Boolean) as string[],
    badge: p.badge || (p.compare_at_cents ? 'Sale' : (p.featured ? 'Featured' : undefined)),
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

export async function getCatalogProduct(slug: string): Promise<CatalogProduct | undefined> {
  const catalog = await getCatalog();
  return catalog.find((p) => p.slug === slug);
}
