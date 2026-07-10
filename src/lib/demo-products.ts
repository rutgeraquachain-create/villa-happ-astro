/**
 * Villa Happ — Catalogus (gespiegeld aan villa-happ.nl, juni 2026)
 *
 * Echte productnamen, prijzen en voorraadstatussen van de live shop.
 * Gebruikt zolang Supabase nog niet is gekoppeld; daarna nemen
 * databaseproducten het over (zie catalog.ts).
 * Variant-ids beginnen met 'demo-': de checkout herkent dit en toont
 * een demo-melding in plaats van een echte Mollie-betaling te starten.
 *
 * NB: productfoto's zijn nog placeholders uit het bestaande beeldarchief.
 */

export interface CatalogVariant {
  id: string;
  size: string;
  stock: number;
  sku: string;
}

export interface CatalogProduct {
  slug: string;
  name: string;
  color: string;
  price_cents: number;
  compare_at_cents?: number;
  short_desc: string;
  description: string;
  details: string[];
  images: string[];
  /** Pad naar een GLB-bestand voor de 360°-viewer op de PDP */
  model?: string;
  badge?: string;
  meta: string;
  /** Totale genummerde oplage (bv. 500). Voedt de echte schaarste-balk op de PDP. */
  edition?: number;
  /** Kort, warm sfeerzinnetje. Verschijnt o.a. in het mandje (Fraunces-italic). */
  note?: string;
  variants: CatalogVariant[];
}

export const DEMO_PRODUCTS: CatalogProduct[] = [
  {
    slug: 'organic-cotton-hoodie-olijfgroen',
    name: 'Organic Cotton Hoodie',
    color: 'Olijfgroen',
    price_cents: 5995,
    compare_at_cents: 6995,
    short_desc: 'Unisex hoodie van biologisch katoen en gerecycled polyester, in olijfgroen.',
    description:
      'De Organic Cotton Hoodie is het eerste vaste stuk van de comeback. Gemaakt van biologisch katoen en gerecycled polyester: zacht, stevig en verantwoord. Het Villa Happ embleem is geborduurd, niet geprint, precies zoals op de stukken uit het archief.',
    details: [
      'Biologisch katoen en gerecycled polyester',
      'Geborduurd Villa Happ embleem',
      'Unisex pasvorm, maat S tot XXL',
      'Ontworpen in Tilburg',
    ],
    images: [
      '/img/products/hoodie-grey-front-v2.webp',
      '/img/products/hoodie-grey-back-v2.webp',
      '/img/products/hoodie-grey-lifestyle-v2.webp',
      '/img/products/hoodie-logo-detail-v2.webp',
    ],
    badge: 'Sale',
    meta: 'Olijfgroen · Unisex',
    note: 'Biologisch katoen, embleem geborduurd in Tilburg.',
    variants: [
      { id: 'demo-olijf-s', size: 'S', stock: 2, sku: 'VH-OCH-OL-S' },
      { id: 'demo-olijf-m', size: 'M', stock: 11, sku: 'VH-OCH-OL-M' },
      { id: 'demo-olijf-l', size: 'L', stock: 9, sku: 'VH-OCH-OL-L' },
      { id: 'demo-olijf-xl', size: 'XL', stock: 8, sku: 'VH-OCH-OL-XL' },
      { id: 'demo-olijf-xxl', size: 'XXL', stock: 2, sku: 'VH-OCH-OL-XXL' },
    ],
  },
  {
    slug: 'organic-cotton-hoodie-navy',
    name: 'Organic Cotton Hoodie',
    color: 'Navy',
    price_cents: 5995,
    compare_at_cents: 6995,
    short_desc: 'Dezelfde hoodie van biologisch katoen, in diep navy.',
    description:
      'De Organic Cotton Hoodie in navy: hetzelfde biologische katoen, hetzelfde geborduurde embleem, een kleur die overal bij past. De maten L en XL zijn bijna op, en XXL is al uitverkocht. Als het op is, is het op.',
    details: [
      'Biologisch katoen en gerecycled polyester',
      'Geborduurd Villa Happ embleem',
      'Unisex pasvorm, maat S tot XXL',
      'Ontworpen in Tilburg',
    ],
    images: [
      '/img/products/hoodie-blue-front-v2.webp',
      '/img/products/hoodie-blue-back.webp',
    ],
    badge: 'Sale',
    meta: 'Navy · Unisex',
    note: 'Biologisch katoen, embleem geborduurd in Tilburg.',
    variants: [
      { id: 'demo-navy-s', size: 'S', stock: 10, sku: 'VH-OCH-NV-S' },
      { id: 'demo-navy-m', size: 'M', stock: 12, sku: 'VH-OCH-NV-M' },
      { id: 'demo-navy-l', size: 'L', stock: 2, sku: 'VH-OCH-NV-L' },
      { id: 'demo-navy-xl', size: 'XL', stock: 2, sku: 'VH-OCH-NV-XL' },
      { id: 'demo-navy-xxl', size: 'XXL', stock: 0, sku: 'VH-OCH-NV-XXL' },
    ],
  },
  {
    slug: 'villa-happ-back-cap',
    name: 'Villa Happ Back-Cap',
    color: 'Limited Edition',
    price_cents: 2195,
    compare_at_cents: 2795,
    short_desc: 'Genummerde oplage van 500 stuks, met uniek code-label en certificaat van echtheid.',
    description:
      'Het allereerste product van de comeback: de Villa Happ Back-Cap. Een oplage van precies 500 stuks, elk exemplaar met een uniek code-label en een certificaat van echtheid. Drop 001 uit het nieuwe hoofdstuk. Als deze 500 op zijn, komen ze niet terug.',
    details: [
      'Limited edition, oplage 500 stuks',
      'Uniek code-label per exemplaar',
      'Certificaat van echtheid',
      'One size, verstelbaar',
      'Ontworpen in Tilburg',
    ],
    images: [
      '/img/products/back-cap-front-v2.webp',
      '/img/products/back-cap-side-v2.webp',
      '/img/products/back-cap-angle-v2.webp',
    ],
    // model: '/models/back-cap.glb',  // weer aanzetten zodra er een scan-kwaliteit model is
    badge: 'Limited · 500',
    meta: 'Drop 001 · One size',
    edition: 500,
    note: 'Genummerd, één van vijfhonderd. Komt niet terug.',
    variants: [
      { id: 'demo-cap-os', size: 'One size', stock: 48, sku: 'VH-CAP-001' },
    ],
  },
  {
    slug: 'stap-voor-stap-sokken',
    name: 'Stap voor Stap sokken',
    color: 'Villa Happ',
    price_cents: 895,
    short_desc: 'De sokken waarmee de comeback begon. Want zo gaat dit verhaal verder: stap voor stap.',
    description:
      'Stap voor Stap: zo heten de sokken, en zo heet de comeback. Een knipoog naar de eerste stapjes waar het in 1960 allemaal mee begon, en naar de manier waarop dit merk terugkeert. Verkrijgbaar in maat 36/41 en 42/46.',
    details: [
      'Verkrijgbaar in 36/41 en 42/46',
      'Villa Happ embleem ingebreid',
      'Ook als 5-pack verkrijgbaar',
      'Ontworpen in Tilburg',
    ],
    images: [
      '/img/brand/villa-happ-logo.webp',
    ],
    meta: 'Sokken · 2 maten',
    note: 'De sokken waarmee de comeback begon.',
    variants: [
      { id: 'demo-sok-3641', size: '36/41', stock: 25, sku: 'VH-SOK-3641' },
      { id: 'demo-sok-4246', size: '42/46', stock: 25, sku: 'VH-SOK-4246' },
    ],
  },
  {
    slug: 'stap-voor-stap-sokken-5-pack',
    name: 'Stap voor Stap sokken · 5-pack',
    color: 'Villa Happ',
    price_cents: 2995,
    compare_at_cents: 4475,
    short_desc: 'Vijf paar Stap voor Stap sokken in één voordeelpack.',
    description:
      'Voor wie elke dag een stap zet: vijf paar Stap voor Stap sokken in één pack, met voordeel. Verkrijgbaar in maat 36/41 en 42/46.',
    details: [
      'Vijf paar per pack',
      'Verkrijgbaar in 36/41 en 42/46',
      'Villa Happ embleem ingebreid',
      'Ontworpen in Tilburg',
    ],
    images: [
      '/img/brand/villa-happ-logo.webp',
    ],
    badge: 'Voordeel',
    meta: '5-pack · 2 maten',
    note: 'Vijf paar, voor elke stap een nieuwe.',
    variants: [
      { id: 'demo-sok5-3641', size: '36/41', stock: 18, sku: 'VH-SOK5-3641' },
      { id: 'demo-sok5-4246', size: '42/46', stock: 18, sku: 'VH-SOK5-4246' },
    ],
  },
];

export function getDemoProduct(slug: string): CatalogProduct | undefined {
  return DEMO_PRODUCTS.find((p) => p.slug === slug);
}
