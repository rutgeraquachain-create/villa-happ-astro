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
  /**
   * Alleen gevuld bij een product dat per kleur verschilt, zoals de VANN-fles.
   * Een hoodie heeft één kleur per product en varieert in maat; daar blijft
   * dit leeg en staat de kleur op het product.
   */
  color?: string;
  colorHex?: string;
  /** Foto van precies deze variant, voor de kleurkeuze en het mandje. */
  image?: string;
}

/**
 * Kleding of iets anders. Staat in de database als `products.collectie`.
 *
 * Let op: de site deelt de shop niet meer op collectie in maar op merk
 * (Villa Happ tegenover Other Brands, zie `merk`). Dit veld blijft staan als
 * productsoort, zodat een latere indeling op soort geen migratie vraagt.
 */
export type Collectie = 'kleding' | 'goods';

export interface CatalogProduct {
  slug: string;
  name: string;
  collectie: Collectie;
  /**
   * Het merk van de maker, alleen bij een product dat Villa Happ niet zelf
   * maakt. Leeg betekent: Villa Happ. Dit stuurt het shopfilter (Other
   * Brands), het merk in het schema, de FAQ en de merkpagina, dus zet het nooit
   * op "Villa Happ". Moet een vermelding hebben in src/lib/merken.ts; daar
   * staan ook logo, omschrijving en waarom wij het goedkeuren.
   */
  merk?: string;
  color: string;
  price_cents: number;
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

/**
 * De kleuren van de VANN-fles, in de volgorde waarin ze op de pagina staan.
 * Zwart eerst, omdat Aqua Chain die ook voert. Daarna de tinten die naast de
 * eigen collectie staan: groen bij de olijfgroene hoodie, blauw bij navy.
 * De hexwaarden zijn gemeten op de productfoto's van VANN.
 */
const VANN_KLEUREN = [
  { naam: 'Black', slug: 'black', code: 'BLK', hex: '#24292A' },
  { naam: 'Highland Green', slug: 'highland-green', code: 'HGR', hex: '#6D875A' },
  { naam: 'Bay Blue', slug: 'bay-blue', code: 'BBL', hex: '#96B4CA' },
  { naam: 'Oatmeal', slug: 'oatmeal', code: 'OAT', hex: '#E7DCC9' },
  { naam: 'Coral', slug: 'coral', code: 'COR', hex: '#FDB49B' },
  { naam: 'Himalayan Salt', slug: 'himalayan-salt', code: 'HSA', hex: '#ECE2E5' },
];

export const DEMO_PRODUCTS: CatalogProduct[] = [
  {
    slug: 'organic-cotton-hoodie-olijfgroen',
    name: 'Organic Cotton Hoodie',
    collectie: 'kleding',
    color: 'Olijfgroen',
    price_cents: 7495,
    short_desc: 'Unisex hoodie van biologisch katoen en gerecycled polyester, in olijfgroen.',
    description:
      'De Organic Cotton Hoodie is het eerste vaste stuk van de comeback. Gemaakt van biologisch katoen en gerecycled polyester: zacht, stevig en verantwoord. Het Villa Happ embleem is geborduurd, niet geprint, precies zoals op de stukken uit het archief.',
    details: [
      'Biologisch katoen en gerecycled polyester',
      'Geborduurd Villa Happ embleem',
      'Unisex pasvorm, maat S tot XXL',
      'Ontworpen in Waalwijk',
    ],
    images: [
      '/img/products/hoodie-olijfgroen-front.webp',
      '/img/products/hoodie-olijfgroen-back.webp',
      '/img/products/hoodie-olijfgroen-lifestyle.webp',
      '/img/products/hoodie-embleem-detail.webp',
    ],
    meta: 'Olijfgroen · Unisex',
    note: 'Biologisch katoen, embleem geborduurd, niet geprint.',
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
    collectie: 'kleding',
    color: 'Navy',
    price_cents: 7495,
    short_desc: 'Dezelfde hoodie van biologisch katoen, in diep navy.',
    description:
      'De Organic Cotton Hoodie in navy: hetzelfde biologische katoen, hetzelfde geborduurde embleem, een kleur die overal bij past. De maten L en XL zijn bijna op, en XXL is al uitverkocht. Als het op is, is het op.',
    details: [
      'Biologisch katoen en gerecycled polyester',
      'Geborduurd Villa Happ embleem',
      'Unisex pasvorm, maat S tot XXL',
      'Ontworpen in Waalwijk',
    ],
    images: [
      '/img/products/hoodie-navy-front.webp',
      '/img/products/hoodie-navy-back.webp',
    ],
    meta: 'Navy · Unisex',
    note: 'Biologisch katoen, embleem geborduurd, niet geprint.',
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
    collectie: 'kleding',
    color: 'Limited Edition',
    price_cents: 2795,
    short_desc: 'Genummerde oplage van 500 stuks, met uniek code-label en certificaat van echtheid.',
    description:
      'Het allereerste product van de comeback: de Villa Happ Back-Cap. Een oplage van precies 500 stuks, elk exemplaar met een uniek code-label en een certificaat van echtheid. Drop 001 uit het nieuwe hoofdstuk. Als deze 500 op zijn, komen ze niet terug.',
    details: [
      'Limited edition, oplage 500 stuks',
      'Uniek code-label per exemplaar',
      'Certificaat van echtheid',
      'One size, verstelbaar',
      'Ontworpen in Waalwijk',
    ],
    images: [
      '/img/products/back-cap-front.webp',
      '/img/products/back-cap-side.webp',
      '/img/products/back-cap-angle.webp',
    ],
    // model: '/models/back-cap.glb',  // weer aanzetten zodra er een scan-kwaliteit model is
    // LET OP bij aanzetten: @google/model-viewer laadt decoders van
    // www.gstatic.com en cdn.jsdelivr.net. Die staan niet in de CSP in
    // vercel.json, dus de viewer blijft dan zwart zonder zichtbare fout.
    // Voeg ze toe aan script-src/connect-src, of host de decoders zelf.
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
    collectie: 'kleding',
    color: 'Villa Happ',
    price_cents: 895,
    short_desc: 'De sokken waarmee de comeback begon. Want zo gaat dit verhaal verder: stap voor stap.',
    description:
      'Stap voor Stap: zo heten de sokken, en zo heet de comeback. Een knipoog naar de eerste stapjes waar het in 1945 allemaal mee begon, en naar de manier waarop dit merk terugkeert. Verkrijgbaar in maat 36/41 en 42/46.',
    details: [
      'Verkrijgbaar in 36/41 en 42/46',
      'Villa Happ embleem ingebreid',
      'Ook als 5-pack verkrijgbaar',
      'Ontworpen in Waalwijk',
    ],
    // Dezelfde beelden als in Supabase. Stond hier eerder het merklogo als
    // plaatshouder, waardoor een build zonder database de sokken toonde met een
    // logo en je de echte foto's lokaal nooit zag. Daarmee kon CI, die zonder
    // sleutels bouwt, een kapot beeldpad ook niet opmerken.
    images: [
      '/img/products/sokken-front-v2.webp',
      '/img/products/sokken-plat-v2.webp',
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
    collectie: 'kleding',
    color: 'Villa Happ',
    price_cents: 3995,
    short_desc: 'Vijf paar Stap voor Stap sokken in één pack.',
    description:
      'Voor wie elke dag een stap zet: vijf paar Stap voor Stap sokken in één pack. Verkrijgbaar in maat 36/41 en 42/46.',
    details: [
      'Vijf paar per pack',
      'Verkrijgbaar in 36/41 en 42/46',
      'Villa Happ embleem ingebreid',
      'Ontworpen in Waalwijk',
    ],
    images: [
      '/img/products/sokken-5-pack-v2.webp',
      '/img/products/sokken-plat-v2.webp',
      '/img/products/sokken-front-v2.webp',
    ],
    meta: '5-pack · 2 maten',
    note: 'Vijf paar, voor elke stap een nieuwe.',
    variants: [
      { id: 'demo-sok5-3641', size: '36/41', stock: 18, sku: 'VH-SOK5-3641' },
      { id: 'demo-sok5-4246', size: '42/46', stock: 18, sku: 'VH-SOK5-4246' },
    ],
  },
  /**
   * Het eerste VH_APProved-product. Moet dezelfde tekst, beelden en SKU's
   * voeren als de rij in Supabase (supabase/migrations/20260918_goods_en_merken.sql),
   * anders bewijst een build zonder sleutels niets over de echte pagina.
   *
   * Productfeiten komen uit de afspraken met VANN en hun eigen productbeeld:
   * 650 ml, driewandig RVS, 24 uur koud en 12 uur warm, lekvrij, BPA-vrij, en
   * de complete set met drie doppen, rietje en borsteltje. Het e-book dat VANN
   * in hun eigen beeld als bonus noemt staat hier bewust niet: dat levert Villa
   * Happ niet, en een belofte in onze productpagina moeten wij waarmaken.
   */
  {
    slug: 'vann-ultimate-bottle-650',
    name: 'VANN Ultimate Bottle 650 ml',
    collectie: 'goods',
    merk: 'VANN',
    color: '',
    price_cents: 3490,
    short_desc: 'Driewandige drinkfles van roestvrij staal. Houdt je drinken 24 uur koud of 12 uur warm.',
    description:
      'De Ultimate Bottle is de drinkfles van VANN. Drie wanden roestvrij staal houden water een hele dag koud en thee twaalf uur warm, en ijsblokjes blijven 24 uur heel. De fles is lekvrij, bevat geen BPA en past in een bekerhouder. Je krijgt er drie doppen bij, zodat je zelf kiest of je uit een rietje, een tuit of de schroefopening drinkt.',
    details: [
      'Roestvrij staal, driewandig geïsoleerd',
      '24 uur koud, 12 uur warm',
      '650 ml, lekvrij en BPA-vrij',
      'Met drie doppen, een rietje en een schoonmaakborstel',
      'Gemaakt door VANN, verstuurd door Villa Happ',
    ],
    images: VANN_KLEUREN.map((k) => `/img/products/vann-ultimate-650-${k.slug}.webp`),
    meta: 'VH_APProved · 6 kleuren',
    note: 'Van VANN, goedgekeurd door Villa Happ.',
    variants: VANN_KLEUREN.map((k) => ({
      id: `demo-vann-${k.slug}`,
      size: '650 ml',
      stock: 12,
      sku: `VH-VANN-650-${k.code}`,
      color: k.naam,
      colorHex: k.hex,
      image: `/img/products/vann-ultimate-650-${k.slug}.webp`,
    })),
  },
];

export function getDemoProduct(slug: string): CatalogProduct | undefined {
  return DEMO_PRODUCTS.find((p) => p.slug === slug);
}
