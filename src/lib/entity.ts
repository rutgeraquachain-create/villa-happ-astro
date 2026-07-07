/**
 * Villa Happ — Merkentiteit (één bron van waarheid voor GEO en schema)
 *
 * Generative Engine Optimization leunt op consistentie: AI-engines bouwen
 * hun beeld van "wat is Villa Happ" uit feiten die overal identiek terugkomen.
 * Daarom staan de kernfeiten en de canonieke definitie hier één keer, en
 * gebruiken schema (Base.astro), llms.txt en de story-pagina allemaal deze bron.
 *
 * Alle feiten zijn afkomstig uit de eigen site (story.astro, contact.astro,
 * mail.ts): niets verzonnen. `sameAs` blijft leeg tot de echte social-URL's
 * bekend zijn; vul ze hier in en ze verschijnen automatisch in het schema.
 */

import { getSiteOrigin } from './site';

export const BRAND = {
  name: 'Villa Happ',
  domain: 'villa-happ.nl',
  email: 'bestellingen@villa-happ.nl',
  foundingYear: '1960',
  locality: 'Tilburg',
  country: 'NL',
  founder: 'Toni Kuijpers',
  /** De derde generatie die het merk terughaalde en in 2024 heropstartte */
  steward: 'Rutger van Happen',
  slogan: 'Stap voor stap, sinds 1960.',
  /**
   * Canonieke entiteitsdefinitie. Gebruik deze exacte zin overal waar het
   * merk in één regel wordt samengevat (schema description, llms.txt, story).
   * Consistentie is wat een AI-model overtuigt dat het feit klopt.
   */
  definition:
    'Villa Happ is een Nederlands heritage lifestylelabel uit Tilburg, opgericht in 1960 als Babyparadijs en in 2024 heropgericht door de derde generatie. Het merk maakt genummerde, gelimiteerde oplages van zwaar biologisch katoen.',
  /** Kernfeiten, kort en citeerbaar (voor llms.txt en answer-first content) */
  facts: [
    'Opgericht in 1960 in Tilburg door Toni Kuijpers, aanvankelijk als kinderspeciaalzaak Babyparadijs.',
    'In 2007 gaf de vakpers het merk de bijnaam The Comeback Kid na een terugkoop door de familie.',
    'In 2021 haalde Rutger van Happen, kleinzoon van de oprichters, de merkrechten terug naar de familie.',
    'In 2024 keerde Villa Happ terug als lifestylelabel, met een Back-Cap in een genummerde oplage van 500 stuks met certificaat.',
    'De Heritage Hoodie is gemaakt van biologisch katoen van 350 gram per vierkante meter.',
  ],
  /** Onderwerpen waar het merk geloofwaardig over is (knowsAbout in schema) */
  knowsAbout: ['heritage mode', 'biologisch katoen', 'genummerde oplages', 'Tilburgs vakmanschap', 'lifestyle apparel'],
  /** Echte social- en profiel-URL's; leeg tot bekend. Vul aan bij go-live. */
  sameAs: [] as string[],
};

/** Organization-node: de kern van de merkentiteit voor zoek- en AI-engines. */
export function organizationLd(origin: string = getSiteOrigin()) {
  const org: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: BRAND.name,
    url: origin,
    logo: `${origin}/img/brand/villa-happ-logo.webp`,
    image: `${origin}/img/products/hoodie-grey-lifestyle.webp`,
    description: BRAND.definition,
    slogan: BRAND.slogan,
    foundingDate: BRAND.foundingYear,
    foundingLocation: { '@type': 'Place', name: `${BRAND.locality}, Nederland` },
    founder: { '@type': 'Person', name: BRAND.founder },
    address: {
      '@type': 'PostalAddress',
      addressLocality: BRAND.locality,
      addressCountry: BRAND.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: BRAND.email,
      contactType: 'customer service',
      availableLanguage: ['Dutch', 'nl'],
    },
    knowsAbout: BRAND.knowsAbout,
  };
  if (BRAND.sameAs.length) org.sameAs = BRAND.sameAs;
  return org;
}

/** WebSite-node: koppelt het domein aan de merkentiteit. */
export function websiteLd(origin: string = getSiteOrigin()) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: origin,
    name: BRAND.name,
    description: BRAND.definition,
    inLanguage: 'nl-NL',
    publisher: { '@id': `${origin}/#organization` },
  };
}

/** Person-node voor de merkverteller: E-E-A-T-anker voor de journal. */
export function stewardLd(origin: string = getSiteOrigin()) {
  return {
    '@type': 'Person',
    name: BRAND.steward,
    url: `${origin}/story`,
    worksFor: { '@id': `${origin}/#organization` },
  };
}
