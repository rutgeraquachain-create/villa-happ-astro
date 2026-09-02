/**
 * Villa Happ — Bedrijfs- en juridische gegevens
 *
 * ÉÉN bron voor alles wat wettelijk op de site moet staan: KvK, btw-id,
 * adressen, contactgegevens, retouradres. De juridische pagina's, het
 * Organization-schema, de footer en de transactiemails lezen allemaal
 * hiervandaan. Wijzig je iets, dan wijzigt het overal mee.
 *
 * NOG AAN TE LEVEREN
 * ------------------
 * Waardes die nog ontbreken staan op `PENDING`. Dat is geen lege string:
 * de pagina's herkennen de waarde en tonen dan "volgt" in plaats van een
 * halve zin, en `pendingFields()` somt ze op. In dev logt de site bij het
 * bouwen welke velden nog open staan, zodat dit niet stil live gaat.
 *
 * Invullen = de PENDING vervangen door de echte waarde. Verder niets.
 */

/** Sentinel voor "moet Geoff nog aanleveren". Nooit als tekst tonen. */
export const PENDING = '__PENDING__' as const;

export function isPending(value: string): boolean {
  return value === PENDING;
}

/** Toon de waarde, of een nette vervanger zolang hij ontbreekt. */
export function orPending(value: string, fallback = 'volgt'): string {
  return isPending(value) ? fallback : value;
}

export const BUSINESS = {
  /* ---------- Identiteit ---------- */
  /** Handelsnaam zoals ingeschreven bij de KvK. */
  legalName: 'Villa Happ Nederland',
  /** Merknaam zoals we die in lopende tekst gebruiken. */
  tradeName: 'Villa Happ',
  legalForm: 'Eenmanszaak',
  /** Naam van de eigenaar; verplicht bij een eenmanszaak. */
  ownerName: 'Rutger van Happen',

  /* ---------- Registraties ---------- */
  kvk: '81998481',
  establishmentNumber: '000048256285',
  /**
   * Btw-IDENTIFICATIENUMMER (NL……B..), het nummer voor facturen en de
   * website. NIET het omzetbelastingnummer: dat is op het BSN gebaseerd
   * en hoort nooit gepubliceerd te worden.
   */
  vatId: 'NL003630352B94',

  /* ---------- Adressen ---------- */
  /**
   * Het adres dat de site publiceert als vestiging. Art. 3:15d BW vraagt om
   * een geografisch adres waar de onderneming gevestigd is; een postbus telt
   * daar formeel niet voor.
   *
   * HEET BEWUST `businessAddress` EN NIET `registeredAddress`.
   * Dit veld voerde eerder Besoyensestraat 90, het KvK-inschrijvingsadres, met
   * als argument dat zakelijke gidsen het register uitlezen en een afwijkend
   * schema een NAP-conflict oplevert. Dat argument klopt nog steeds, maar er
   * staat iets zwaarders tegenover: Besoyensestraat 90 is het woonadres van
   * Rutger, en dat hoort niet op een webshop, in een schema en in elke
   * bedrijvengids die dat overneemt.
   *
   * Dus vanaf 25 augustus 2026 Vijzelweg 18E, het adres waar het werk gebeurt.
   * De oude naam zou daarmee liegen zolang het register nog Besoyensestraat
   * aanhoudt, vandaar de hernoeming. `businessAddress` blijft ook kloppen
   * nadat de KvK is bijgewerkt.
   *
   * Let op bij het narekenen: de KvK-inschrijving staat nog op Besoyensestraat
   * 90. Zolang dat zo is wijkt de site af van het register, en omdat het
   * KvK-nummer op de site staat is dat na te trekken. Dat is geen fout in de
   * code: de wet vraagt het adres waar de onderneming feitelijk gevestigd is,
   * en dat is Vijzelweg. Wordt het register bijgewerkt, dan vallen de twee weer
   * samen en hoeft hier niets te veranderen.
   *
   * St. Antoniusstraat 102 is een nog oudere inschrijving die extern rondzwerft
   * en daar opgeschoond hoort te worden.
   */
  businessAddress: {
    street: 'Vijzelweg 18E',
    postalCode: '5145 NK',
    city: 'Waalwijk',
  },
  /**
   * Postadres. Mag wél een postbus zijn. Wordt alleen gebruikt als terugval in
   * `addressLine()` zolang het vestigingsadres ontbreekt, dus in de praktijk
   * nooit zichtbaar. Stond op Besoyensestraat en is meeverhuisd: een woonadres
   * hoort ook niet in de broncode van een openbare repository te blijven staan.
   */
  postalAddress: {
    line: 'Vijzelweg 18E',
    postalCode: '5145 NK',
    city: 'Waalwijk',
  },
  /** Vestigingsplaats; voedt het Organization-schema. */
  locality: 'Waalwijk',
  region: 'Noord-Brabant',
  country: 'NL',
  countryName: 'Nederland',
  /**
   * Waar retourzendingen heen gaan. Sinds 25 augustus 2026 hetzelfde adres als
   * `businessAddress`, en dat blijft een apart veld met een eigen reden.
   *
   * De rollen verschillen namelijk. Het vestigingsadres staat er omdat de wet
   * een geografisch adres eist; dit adres staat er omdat een consument er een
   * pakket heen stuurt, met een tenaamstelling erbij. Verhuist het bedrijf en
   * blijft het retourpunt, of andersom, dan lopen ze weer uiteen. Ze samen in
   * één veld duwen omdat ze vandaag gelijk zijn, kost dan meer dan het oplevert.
   *
   * Een herroeping naar het verkeerde adres geldt als niet ontvangen, dus dit
   * adres moet op de retour- en herroepingspagina's blijven staan.
   */
  returnAddress: {
    name: 'Villa Happ Nederland',
    street: 'Vijzelweg 18E',
    postalCode: '5145 NK',
    city: 'Waalwijk',
  },

  /* ---------- Contact ---------- */
  /**
   * Eén adres voor de hele site. Dit staat op ruim tien plekken, waaronder
   * de wettelijk verplichte contactgegevens en de herroepingspagina. Een
   * herroeping naar een bouncend adres geldt als niet ontvangen, dus dit
   * adres mag pas wijzigen nadat het postvak of de alias in Microsoft 365
   * bestaat en er aantoonbaar post op binnenkomt.
   *
   * Sinds de domeinverhuizing staat hier `@villahapp.nl`. De oude adressen
   * op `@villa-happ.nl` blijven als alias op hetzelfde postvak bestaan, want
   * die staan in bestelbevestigingen die al de deur uit zijn.
   */
  /**
   * Alles rond een bestelling: de afzender van de bevestiging, de
   * verzendmelding en de terugbetaling, en de postbus waar de melding van een
   * nieuwe bestelling binnenkomt.
   *
   * Aangemaakt op 2 september 2026, daarvoor stond hier `contact@`. Onder elke
   * orderbevestiging staat "Antwoord gewoon op deze mail", dus dit is ook het
   * adres waar klantvragen over een bestelling landen. Bouncet dit adres, dan
   * verdwijnen die antwoorden zonder dat iemand het merkt.
   */
  orderEmail: 'bestellingen@villahapp.nl',
  /**
   * Het adres dat de site publiceert: contactpagina, voorwaarden, herroeping,
   * pers. Blijft bewust `contact@`, want dat is het adres dat in eerdere
   * bestelbevestigingen en op externe vermeldingen staat.
   */
  supportEmail: 'contact@villahapp.nl',
  /** Aparte AVG-postbus is netjes maar niet verplicht bij een eenmanszaak. */
  privacyEmail: 'contact@villahapp.nl',
  /**
   * Eén nummer voor de hele vindbaarheid. Moet TEKEN VOOR TEKEN gelijk zijn
   * aan wat in het Google Business Profile en op LinkedIn staat: Google en
   * AI-engines koppelen een bedrijf op een exacte match van naam, adres en
   * telefoonnummer. Twee varianten van hetzelfde nummer verzwakken die
   * koppeling in plaats van hem te versterken.
   *
   * Spaties mogen: de `tel:`-links strippen ze (zie LegalLayout), en het
   * schema geeft de waarde door zoals hij hier staat.
   */
  phone: '+31 6 19848002',

  /* ---------- Betalen ---------- */
  /**
   * De methoden die we op de site noemen, in de volgorde waarin ze
   * verschijnen. Dit is uitsluitend wat de site vertélt: de checkout stuurt
   * géén methodelijst mee naar Mollie (zie api/checkout/create.ts), dus wat
   * een klant werkelijk ziet komt van het Mollie-profiel. Zet je daar iets
   * aan of uit, dan is dit de enige plek in de code die mee moet.
   *
   * Stond eerder vijf keer los in de sjablonen, met Apple Pay nergens erbij
   * terwijl het al maanden aanstond bij Mollie.
   */
  paymentMethods: ['iDEAL', 'Bancontact', 'Apple Pay', 'Mastercard', 'Visa'],

  /* ---------- Beleid (moet matchen met de praktijk) ---------- */
  /** Wettelijk minimum is 14 dagen; wij geven er meer. */
  returnDays: 30,
  /**
   * De wettelijke bedenktijd (art. 6:230o BW). Binnen deze termijn mogen we
   * geen verwerkingskosten rekenen; de dagen daarna zijn onze eigen,
   * vrijwillige verlenging en daar hangt wél een vergoeding aan.
   */
  statutoryReturnDays: 14,
  /** Terugbetaaltermijn na ontvangst van de retour. */
  refundDays: 14,
  /**
   * Landen waar retourneren gratis is. Sinds de herstart nergens: de klant
   * betaalt de retourzending zelf en er gaan verwerkingskosten af.
   */
  freeReturnCountries: [] as string[],
  /**
   * Verwerkingskosten die we bij een retour inhouden op de terugbetaling.
   * Staat los van de retourverzending, die de klant zelf regelt en betaalt.
   * Geldt alleen vanaf dag 15: binnen de wettelijke bedenktijd mag dit niet.
   */
  returnFeeCents: 1000,
  vatRate: 21,
} as const;

/* ---------- Placeholderregister ---------- */

interface PendingField {
  path: string;
  label: string;
  why: string;
}

const PENDING_CANDIDATES: PendingField[] = [
  { path: 'vatId', label: 'Btw-identificatienummer', why: 'Verplicht op de site en op facturen (art. 3:15d BW).' },
  { path: 'businessAddress.street', label: 'Vestigingsadres — straat en nummer', why: 'Geografisch adres is verplicht voor een webshop.' },
  { path: 'businessAddress.postalCode', label: 'Vestigingsadres — postcode', why: 'Hoort bij het vestigingsadres.' },
  { path: 'businessAddress.city', label: 'Vestigingsadres — plaats', why: 'Hoort bij het vestigingsadres.' },
  { path: 'returnAddress.name', label: 'Retouradres — tenaamstelling', why: 'Klanten moeten weten naar wie ze terugsturen.' },
  { path: 'returnAddress.street', label: 'Retouradres — straat en nummer', why: 'Zonder retouradres kan niemand retourneren.' },
  { path: 'returnAddress.postalCode', label: 'Retouradres — postcode', why: 'Hoort bij het retouradres.' },
  { path: 'returnAddress.city', label: 'Retouradres — plaats', why: 'Hoort bij het retouradres.' },
  { path: 'phone', label: 'Telefoonnummer', why: 'Niet strikt verplicht, wel een sterk vertrouwenssignaal in een webshop.' },
];

function readPath(path: string): string {
  return path.split('.').reduce<any>((acc, key) => acc?.[key], BUSINESS) ?? '';
}

/** Welke gegevens ontbreken nog? Voedt de opleverchecklist. */
export function pendingFields(): PendingField[] {
  return PENDING_CANDIDATES.filter((f) => isPending(readPath(f.path)));
}

/* ---------- Afgeleide weergaves ---------- */

/** Vestigingsadres op één regel, of het postadres zolang dat ontbreekt. */
export function addressLine(): string {
  const v = BUSINESS.businessAddress;
  if (!isPending(v.street) && !isPending(v.postalCode) && !isPending(v.city)) {
    return `${v.street}, ${v.postalCode} ${v.city}`;
  }
  const p = BUSINESS.postalAddress;
  return `${p.line}, ${p.postalCode} ${p.city}`;
}

/** Retouradres als regels, of null zolang het ontbreekt. */
export function returnAddressLines(): string[] | null {
  const r = BUSINESS.returnAddress;
  if (Object.values(r).some(isPending)) return null;
  return [r.name, r.street, `${r.postalCode} ${r.city}`, BUSINESS.countryName];
}

/** Is retour gratis vanuit dit land? */
export function freeReturnFrom(country: string): boolean {
  return BUSINESS.freeReturnCountries.includes(country);
}

// Bij het bouwen één keer melden wat er nog open staat; zo verdwijnt een
// vergeten gegeven niet stil in een live pagina.
if (import.meta.env.DEV || import.meta.env.PROD) {
  const open = pendingFields();
  if (open.length) {
    console.warn(
      `[business] ${open.length} gegeven(s) nog niet aangeleverd: ` +
        open.map((f) => f.label).join(', '),
    );
  }
}
