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
import { BUSINESS, isPending } from './business';

export const BRAND = {
  name: 'Villa Happ',
  domain: 'villa-happ.nl',
  email: BUSINESS.orderEmail,
  /**
   * 10 mei 1945: de dag dat Tony Kuijsters met haar partner Gaillard de
   * winkel Gaillard Kuijsters opende aan de Noordstraat 85 in Tilburg, vijf
   * dagen na de bevrijding. Hier stond eerder 1960, wat nergens op sloeg:
   * Babyparadijs kwam er pas midden jaren vijftig bij, na de dood van
   * Gaillard en de ontmoeting met Noud van Happen.
   */
  foundingYear: '1945',
  /** Het jaar waarin het merk als lifestylelabel opnieuw van start ging. */
  relaunchYear: '2026',
  /**
   * Waar het verhaal begon: Tilburg, 1945. Uitsluitend een historisch feit
   * en dus alleen goed voor `foundingLocation`. Het merk zit vandaag niet
   * meer in Tilburg.
   */
  foundingLocality: 'Tilburg',
  /**
   * Waar Villa Happ nu zit. Gelijk aan de KvK-vestiging in business.ts
   * (Waalwijk) en aan het `address`-veld van het schema. Een schema dat
   * een andere plaats claimt dan de inschrijving is een controleerbaar
   * onjuist feit.
   */
  locality: 'Waalwijk',
  country: 'NL',
  founder: 'Tony Kuijsters',
  /** De derde generatie die het merk terughaalde en in 2026 heropstartte */
  steward: 'Rutger van Happen',
  slogan: 'Stap voor stap, sinds 1945.',
  /**
   * Canonieke entiteitsdefinitie. Gebruik deze exacte zin overal waar het
   * merk in één regel wordt samengevat (schema description, llms.txt, story).
   * Consistentie is wat een AI-model overtuigt dat het feit klopt.
   */
  definition:
    'Villa Happ is een Nederlands heritage lifestylelabel uit Waalwijk, in 1945 in Tilburg begonnen als winkel van Tony Kuijsters en in 2026 heropgericht door de derde generatie. Het merk maakt genummerde, gelimiteerde oplages van zwaar biologisch katoen.',
  /** Kernfeiten, kort en citeerbaar (voor llms.txt en answer-first content) */
  facts: [
    'Het verhaal begon op 10 mei 1945 in Tilburg, toen Tony Kuijsters met haar partner Gaillard de winkel Gaillard Kuijsters opende aan de Noordstraat 85.',
    'Midden jaren vijftig opende Tony samen met Noud van Happen de kinderspeciaalzaak Babyparadijs in de Heuvelstraat in Tilburg.',
    'Noud van Happen was in de jaren zestig de eerste Europeaan die in Azië een eigen productielijn opzette; de fabrieken in China en Bangladesh bleven tot eind 2010 in familiehanden.',
    'In 2007 gaf de vakpers het merk de bijnaam The Comeback Kid na een terugkoop door de familie.',
    'In 2021 haalde Rutger van Happen, kleinzoon van de oprichters, de merkrechten terug naar de familie.',
    'In 2026 keerde Villa Happ terug als lifestylelabel, met een Back-Cap in een genummerde oplage van 500 stuks met certificaat.',
    'Het merk ontstond in Tilburg en is vandaag gevestigd in Waalwijk.',
    'De Heritage Hoodie is gemaakt van biologisch katoen van 350 gram per vierkante meter.',
  ],
  /** Onderwerpen waar het merk geloofwaardig over is (knowsAbout in schema) */
  knowsAbout: ['heritage mode', 'biologisch katoen', 'genummerde oplages', 'Brabants vakmanschap', 'lifestyle apparel'],
  /** Leeftijd van het merk, berekend i.p.v. hardgecodeerd ("65 jaar" liep achter). */
  get age(): number {
    return new Date().getFullYear() - Number(this.foundingYear);
  },
  /** Echte profiel-URL's die de merkentiteit aan de kennisgraaf koppelen */
  sameAs: ['https://www.linkedin.com/company/villahapp'] as string[],
  /** Profiel-URL('s) van de merkverteller Rutger van Happen (Person-entiteit) */
  stewardSameAs: ['https://www.linkedin.com/in/rutger-van-happen-a27b4727'] as string[],
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
    image: `${origin}/img/og/villa-happ-og.webp`,
    description: BRAND.definition,
    slogan: BRAND.slogan,
    foundingDate: BRAND.foundingYear,
    foundingLocation: { '@type': 'Place', name: `${BRAND.foundingLocality}, Nederland` },
    founder: { '@type': 'Person', name: BRAND.founder },
    legalName: BUSINESS.legalName,
    // Vestigingsplaats volgens de KvK, niet de plaats uit het verhaal
    address: {
      '@type': 'PostalAddress',
      ...(isPending(BUSINESS.visitingAddress.street)
        ? {}
        : {
            streetAddress: BUSINESS.visitingAddress.street,
            postalCode: BUSINESS.visitingAddress.postalCode,
          }),
      addressLocality: isPending(BUSINESS.visitingAddress.city)
        ? BUSINESS.locality
        : BUSINESS.visitingAddress.city,
      addressRegion: BUSINESS.region,
      addressCountry: BUSINESS.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: BRAND.email,
      ...(isPending(BUSINESS.phone) ? {} : { telephone: BUSINESS.phone }),
      contactType: 'customer service',
      availableLanguage: ['Dutch', 'nl'],
    },
    knowsAbout: BRAND.knowsAbout,
    identifier: [
      { '@type': 'PropertyValue', name: 'KvK', value: BUSINESS.kvk },
      ...(isPending(BUSINESS.vatId)
        ? []
        : [{ '@type': 'PropertyValue', name: 'BTW', value: BUSINESS.vatId }]),
    ],
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
  const person: Record<string, unknown> = {
    '@type': 'Person',
    name: BRAND.steward,
    url: `${origin}/story`,
    worksFor: { '@id': `${origin}/#organization` },
  };
  if (BRAND.stewardSameAs.length) person.sameAs = BRAND.stewardSameAs;
  return person;
}
