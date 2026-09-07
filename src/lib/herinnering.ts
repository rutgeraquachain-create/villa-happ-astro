/**
 * Villa Happ — de herinneringsactie
 *
 * Bezoekers sturen een herinnering aan Villa Happ in en mailen hun oude foto
 * daarna naar het contactadres, met hun inzendnummer erbij. De mooiste
 * inzending wint een tegoedbon.
 *
 * Puur en zonder I/O, zodat de regels los van de database te toetsen zijn.
 *
 * WAAROM DE NIEUWSBRIEF HIER EEN APART VINKJE IS
 * ----------------------------------------------
 * Het eerste ontwerp koppelde de inschrijving aan deelname: wie meedeed, stond
 * op de lijst. Dat maakt de toestemming ongeldig. De AVG eist dat toestemming
 * vrij gegeven is (art. 7 lid 4), en toestemming die voorwaarde is voor
 * meedoen aan een prijsvraag is dat niet: de deelnemer heeft geen echte keuze.
 *
 * Het gevolg zou niet abstract zijn geweest. Een lijst die zo is opgebouwd mag
 * je niet voor reclame gebruiken, en die lijst is precies het doel van de hele
 * campagne. Vandaar drie losse vinkjes, geen enkele vooraf aangevinkt.
 *
 * Over de prijsvraag zelf mag je een deelnemer wél mailen, ook zonder dat
 * vakje. Dat hoort bij de deelname waar hij zich voor aanmeldde.
 */

/** De drie toestemmingen. Los te geven, los vast te leggen. */
export interface Toestemmingen {
  /** Aanmelding voor de nieuwsbrief. Leidt tot een bevestigingsmail. */
  nieuwsbrief: boolean;
  /** De ingestuurde foto mag in het archief op de website. */
  magArchief: boolean;
  /** De naam mag bij het verhaal of de foto worden getoond. */
  magNaam: boolean;
}

export const ACTIE = {
  /** Waarde van de tegoedbon, in centen. */
  prijsCents: 7500,
  /** Waar de foto heen gaat. Staat hier zodat pagina, mail en voorwaarden gelijk lopen. */
  fotoAdres: 'contact@villahapp.nl',
  /**
   * Sluiting: zondag 11 oktober 2026, einde van de dag Nederlandse tijd.
   * Zie de toelichting bij `isGesloten` voor waarom hier 21:59:59.999Z staat.
   */
  sluit: '2026-10-11T21:59:59.999Z',
  /** Bekendmaking van de winnaar. */
  uitslag: '2026-10-16',
} as const;

/**
 * Is de actie voorbij?
 *
 * De sluitdatum staat in UTC en eindigt op 21:59:59.999Z, want dat is
 * 23:59:59.999 Nederlandse tijd in oktober (zomertijd, UTC+2). Een kale
 * middernacht in UTC zou de actie hier twee uur te vroeg sluiten, en dat merkt
 * precies degene die op de laatste avond nog inzendt.
 */
export function isGesloten(nu: Date = new Date()): boolean {
  return nu.getTime() > Date.parse(ACTIE.sluit);
}

/**
 * Een naam die als naam leest.
 *
 * Bewust ruim: mensen heten Ó Briain, van der Aa, of D'Angelo. De ondergrens
 * dient alleen om een leeg of onzinnig veld tegen te houden.
 */
export function naamGeldig(naam: string): boolean {
  return naam.trim().length >= 2 && naam.trim().length <= 80;
}

/**
 * De ondergrens op het verhaal.
 *
 * Er zit een jury op deze inzendingen, dus een lege of eenwoordige inzending
 * kost iemand handwerk zonder dat er iets te beoordelen valt. Vijftien tekens
 * is laag genoeg om "Ik kreeg er mijn eerste jas" door te laten, en hoog genoeg
 * om een lege inzending te weren.
 */
export const HERINNERING_MIN = 15;
export const HERINNERING_MAX = 4000;

export function herinneringGeldig(tekst: string): boolean {
  const kaal = tekst.trim();
  return kaal.length >= HERINNERING_MIN && kaal.length <= HERINNERING_MAX;
}

/**
 * Het inzendnummer zoals de database het maakt: HH-2026-0001.
 *
 * Deze controle staat hier omdat het nummer in de bevestigingsmail komt en de
 * deelnemer het overtypt in zijn eigen mail. Een nummer dat niet aan deze vorm
 * voldoet is geen nummer maar een foutmelding die per ongeluk is doorgegeven.
 */
export function nummerGeldig(nummer: string | null | undefined): boolean {
  return typeof nummer === 'string' && /^HH-\d{4}-\d{4}$/.test(nummer);
}

/** De prijs als leesbaar bedrag, voor pagina, mail en voorwaarden. */
export function prijsInEuro(): string {
  return `€ ${(ACTIE.prijsCents / 100).toFixed(2).replace('.', ',')}`;
}
