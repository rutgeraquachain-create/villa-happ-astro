/**
 * Villa Happ — De merken naast de eigen collectie (VH_APProved)
 *
 * Eén bron voor alles wat bij een merk hoort en niet bij een product: de
 * slug van de merkpagina, het logo, de omschrijving en waarom wij het merk
 * goedkeuren. /brands, /brands/<slug>, de productpagina en het schema lezen
 * hier.
 *
 * WAAROM IN DE CODE EN NIET IN SUPABASE
 * Een nieuw merk vraagt toch al een deploy, want productfoto's en het logo
 * staan in public/. Logo en tekst gaan zo in dezelfde PR mee als de beelden.
 * Besloten door Geoffrey, 18 september 2026.
 *
 * De koppeling met een product loopt via `products.merk`, dat gelijk moet zijn
 * aan `naam` hieronder. Staat er een gepubliceerd product met een merk dat hier
 * ontbreekt, dan breekt de build (zie `vindMerk`): een merkproduct zonder
 * merkpagina zou anders stil op een 404 uitkomen.
 *
 * Het logo komt van het merk zelf, onbewerkt. VANN heeft ingestemd met de
 * verkoop via Villa Happ; het wordmerk is het officiële vectorbestand.
 */

export interface Merk {
  /** Pad onder /brands. Kleine letters, geen spaties. */
  slug: string;
  /** Gelijk aan `products.merk`. */
  naam: string;
  /** Pad in public/, liefst een SVG. */
  logo: string;
  /** Breedte en hoogte van het logo, voor een rustige tegel zonder verspringen. */
  logoMaat: { breedte: number; hoogte: number };
  /** Wie het merk is. Staat op de merkpagina, één alinea per regel. */
  omschrijving: string[];
  /** Waarom wij het goedkeuren. Staat in het VH_APProved-blok. */
  waarom: string;
}

export const MERKEN: Merk[] = [
  {
    slug: 'vann',
    naam: 'VANN',
    logo: '/img/brands/vann.svg',
    logoMaat: { breedte: 188, hoogte: 60 },
    omschrijving: [
      'VANN is een Nederlands merk dat sinds 2020 herbruikbare drinkflessen van roestvrij staal maakt. De naam komt uit het Noors en betekent water.',
      'De flessen zijn driewandig geïsoleerd en houden je drinken 24 uur koud of 12 uur warm. Ze zijn lekvrij en bevatten geen BPA.',
    ],
    waarom:
      'We nemen VANN op omdat het past bij hoe wij naar kleding kijken: iets goed maken, zodat je het jaren gebruikt.',
  },
];

export const merkPad = (m: Merk) => `/brands/${m.slug}`;

/** Hoort dit product bij dit merk? */
export const vanMerk = (p: { merk?: string }, m: Merk) => p.merk?.trim().toLowerCase() === m.naam.toLowerCase();

/**
 * De merken waarvan een gepubliceerd product in de catalogus staat. Dat is de
 * enige voorwaarde voor een logo op /brands, een merkpagina, een regel in de
 * sitemap en in llms.txt. Eén functie, zodat die vier niet uit elkaar lopen.
 */
export function merkenMetProduct(catalogus: { merk?: string }[]): Merk[] {
  return MERKEN.filter((m) => catalogus.some((p) => vanMerk(p, m)));
}

/** Het merk bij `products.merk`, hoofdletterongevoelig. */
export function zoekMerk(naam: string | undefined | null): Merk | undefined {
  if (!naam) return undefined;
  const n = naam.trim().toLowerCase();
  return MERKEN.find((m) => m.naam.toLowerCase() === n);
}

/**
 * Zoals `zoekMerk`, maar een onbekend merk is een fout. Gebruik dit op
 * build-moment, waar een ontbrekend merk moet opvallen.
 */
export function vindMerk(naam: string): Merk {
  const merk = zoekMerk(naam);
  if (!merk) {
    throw new Error(
      `[merken] Product met merk "${naam}" heeft geen vermelding in src/lib/merken.ts. ` +
        'Voeg het merk toe (slug, logo, omschrijving) of zet het product terug op draft.',
    );
  }
  return merk;
}
