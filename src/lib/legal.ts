/**
 * Villa Happ — gedeelde juridische constanten
 *
 * Eén datum en één set formuleringen voor de juridische pagina's, de
 * transactiemails en de checkout. Zo kan een belofte niet op één plek
 * veranderen en op de andere blijven staan — precies de fout die de
 * audit op het retourbeleid vond.
 */

import { BUSINESS } from './business';
import { FREE_SHIPPING_CENTS, SHIPPING_RATES_CENTS } from './shipping';

/** Datum onder aan elke juridische pagina. Handmatig bijwerken bij wijziging. */
export const LEGAL_UPDATED = '3 augustus 2026';

/** Bedrag in centen als "€ 8,95". Eén notatie voor alle juridische teksten. */
export function eur(cents: number): string {
  return '€ ' + (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Verzendtarieven — de bedragen komen uit shipping.ts, de bron waarmee het
 * mandje en de checkout rekenen. Alleen land en levertijd staan hier, zodat
 * een tariefwijziging nooit half kan landen.
 */
export const SHIPPING_TABLE = [
  { country: 'Nederland', code: 'NL', costCents: SHIPPING_RATES_CENTS.NL, delivery: 'Binnen 3 werkdagen' },
  { country: 'België', code: 'BE', costCents: SHIPPING_RATES_CENTS.BE, delivery: 'Binnen 5 werkdagen' },
  { country: 'Duitsland', code: 'DE', costCents: SHIPPING_RATES_CENTS.DE, delivery: 'Binnen 5 werkdagen' },
] as const;

/** Drempel voor gratis verzending, als tekst: "€ 150,00". */
export const FREE_SHIPPING_TEXT = eur(FREE_SHIPPING_CENTS);

/** Eén zin over de verzendkosten, voor PDP, FAQ en voorwaarden. */
export const SHIPPING_SENTENCE =
  `Verzending kost ${eur(SHIPPING_RATES_CENTS.NL)} binnen Nederland en ` +
  `${eur(SHIPPING_RATES_CENTS.BE)} naar België en Duitsland. ` +
  `Vanaf ${FREE_SHIPPING_TEXT} verzenden we gratis naar alle drie de landen.`;

/** Korte variant voor badges en trustregels. */
export const FREE_SHIPPING_SHORT = `Gratis verzending vanaf ${FREE_SHIPPING_TEXT} (NL, BE, DE)`;

/**
 * Het retourbeleid, in één formulering. Uitwerking: docs/retourbeleid.md.
 * Vier regels die overal identiek moeten terugkomen, want ze bepalen wat een
 * klant terugkrijgt:
 *
 *  1. De retourzending betaalt de klant altijd zelf.
 *  2. Verwerkingskosten gelden alléén vanaf dag 15. Binnen de wettelijke
 *     bedenktijd van 14 dagen mogen we ze niet rekenen; dag 15 tot en met
 *     30 is onze eigen verlenging en daar hangt de vergoeding aan.
 *  3. Heenzendkosten komen alleen terug bij een vólledige retour. Houd je
 *     een deel van de bestelling, dan blijft de verzending een dienst die
 *     geleverd is en vergoeden we alleen de teruggestuurde artikelen.
 *  4. Zakt de behouden waarde door een gedeeltelijke retour onder de
 *     gratisverzendgrens, dan vervalt die voorwaardelijke korting en
 *     verrekenen we het verzendtarief alsnog.
 *
 * Vooraf melden is hier een juridische voorwaarde, geen marketing: informeer
 * je de consument niet correct, dan vervalt zijn aansprakelijkheid voor
 * waardevermindering en draaien wij op voor de retourkosten. Elke plek die
 * iets over retour zegt, zegt dus dít.
 */
export const RETURN_FEE_TEXT = eur(BUSINESS.returnFeeCents);

/** Eerste dag waarop de verwerkingskosten gelden (dag na de wettelijke termijn). */
export const RETURN_FEE_FROM_DAY = BUSINESS.statutoryReturnDays + 1;

export const RETURN_SHORT = `${BUSINESS.returnDays} dagen bedenktijd · retour op eigen kosten`;

/** Regel 2, los bruikbaar. */
export const RETURN_FEE_SENTENCE =
  `Meld je je retour binnen ${BUSINESS.statutoryReturnDays} dagen, dan betaal je alleen de ` +
  `retourzending. Meld je hem op dag ${RETURN_FEE_FROM_DAY} tot en met ${BUSINESS.returnDays}, ` +
  `dan houden we daarnaast ${RETURN_FEE_TEXT} verwerkingskosten in op de terugbetaling.`;

/** Regel 3, los bruikbaar. */
export const RETURN_SHIPPING_REFUND_SENTENCE =
  'Stuur je je hele bestelling terug, dan krijg je ook de standaard verzendkosten van de ' +
  'heenzending volledig terug. Stuur je maar een deel terug, dan vergoeden we alleen de ' +
  'geretourneerde artikelen en blijven de heenzendkosten staan.';

/** Regel 4, los bruikbaar. Moet vóór het afrekenen kenbaar zijn. */
export const RETURN_SHIPPING_CORRECTION_SENTENCE =
  `Stuur je een deel van je bestelling terug en zakt het bedrag dat je houdt onder de ` +
  `${FREE_SHIPPING_TEXT}, dan verrekenen we alsnog de verzendkosten die je door de ` +
  `gratisverzendgrens niet hebt betaald.`;

/**
 * Waardevermindering (mechanisme B). De belofte in de laatste zin is geen
 * franje: zonder aankondiging vooraf is een inhouding niet houdbaar.
 */
export const RETURN_CONDITION_SENTENCE =
  'Passen mag, net als in een winkel: uitpakken, bekijken, aantrekken, ook meerdere keren. ' +
  'Is een stuk gedragen, gewassen of beschadigd, dan verrekenen we de waardevermindering. ' +
  'We laten je dat altijd eerst weten, met foto, en je kunt het stuk dan ook terugkrijgen.';

export const RETURN_SENTENCE =
  `Je hebt ${BUSINESS.returnDays} dagen bedenktijd, ruimer dan de wettelijke ` +
  `${BUSINESS.statutoryReturnDays}. De retourzending regel en betaal je zelf. ` +
  `${RETURN_FEE_SENTENCE} ${RETURN_SHIPPING_REFUND_SENTENCE} ` +
  `${RETURN_SHIPPING_CORRECTION_SENTENCE} ${RETURN_CONDITION_SENTENCE}`;

/**
 * Betaalmethoden, afgeleid uit business.ts. De opsomming met "en" ervoor is
 * bedoeld voor lopende tekst (FAQ, voorwaarden); de puntenreeks voor
 * trustregels onder een knop.
 */
const METHODS = BUSINESS.paymentMethods;

/** "iDEAL, Bancontact, Apple Pay, Mastercard en Visa" */
export const PAYMENT_LIST =
  METHODS.length > 1
    ? `${METHODS.slice(0, -1).join(', ')} en ${METHODS[METHODS.length - 1]}`
    : METHODS[0];

/** Eén zin voor de FAQ, de voorwaarden en de productpagina. */
export const PAYMENT_SENTENCE = `Betalen doe je veilig via Mollie, met ${PAYMENT_LIST}.`;

/** Korte trustregel voor het mandje en de productpagina. */
export const PAYMENT_SHORT = `Veilig betalen via Mollie · ${METHODS.join(', ')}`;

/** Zin over btw. Alle prijzen op de site zijn consumentenprijzen. */
export const VAT_SENTENCE = `Alle prijzen zijn in euro's en inclusief ${BUSINESS.vatRate}% btw.`;

/** Levertijdbelofte, in één formulering voor PDP, FAQ en verzendpagina. */
export const DELIVERY_SENTENCE =
  'Bestel je op een werkdag voor 16:00, dan gaat je pakket dezelfde dag via PostNL op de bus. ' +
  'Binnen Nederland is je bestelling doorgaans binnen 3 werkdagen in huis, ' +
  'in België en Duitsland binnen 5 werkdagen.';
