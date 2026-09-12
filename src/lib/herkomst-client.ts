/**
 * Villa Happ — de ingang van een bezoek vastleggen, in de browser
 *
 * De server leest de herkomst uit wat deze module meestuurt. De regel die dit
 * bestand draagt: meet bij het BEGIN van het bezoek en niet bij het versturen.
 * Wie via LinkedIn binnenkomt, eerst de winkel bekijkt en daarna pas zijn
 * herinnering instuurt, heeft bij het versturen de eigen site als verwijzer. De
 * echte bron is dan weg, want de browser overschrijft de verwijzer bij elke klik.
 *
 * WAAR DE INGANG BEWAARD WORDT, EN WAAROM NIET ALTIJD
 * ---------------------------------------------------
 * In het geheugen van de pagina, altijd. Dat schrijft niets op het apparaat van
 * de bezoeker, en onder de SPA-router van deze site blijft het geheugen staan
 * zolang je van pagina naar pagina klikt.
 *
 * In `sessionStorage`, alleen met toestemming voor analytics. Dat is wél opslag
 * op het apparaat, en het doel is meten: daar vraagt de site toestemming voor.
 * Het is nodig omdat de homepage en het atelier elke link als volledige
 * pageload openen (zie `markReloadLinks` in Base.astro), en dan is het geheugen
 * weg.
 *
 * WAT DAT KOST, en dat is een bewuste keuze
 * Zonder toestemming overleeft de ingang geen volledige pageload. Wie op de
 * homepage landt en daarna naar /herinnering klikt, komt dan binnen met
 * `meting: 'pagina'` en de eigen site als verwijzer, en de server maakt daar
 * eerlijk ONBEKEND van. Link een campagne daarom rechtstreeks naar de pagina
 * waar de actie staat, met de utm-velden in de link: dan staat alles op de
 * pagina zelf en is er geen opslag nodig.
 */

import { getConsent, onConsentChange } from './consent';
import type { Herkomst } from './herkomst';

const SLEUTEL = 'vh_ingang_v1';
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

let geheugen: Herkomst | null = null;
let luistert = false;

const zonderWww = (h: string) => h.replace(/^www\./, '');

function hostVan(url: string): string {
  try {
    return url ? zonderWww(new URL(url).hostname) : '';
  } catch {
    return '';
  }
}

/** Wat deze pagina zelf over zijn herkomst zegt. */
function signalenVanDezePagina(meting: 'ingang' | 'pagina'): Herkomst {
  const p = new URLSearchParams(location.search);
  const h: Herkomst = { meting, ingang: location.pathname };
  for (const k of UTM) {
    const v = p.get(k);
    if (v) h[k] = v.slice(0, 100);
  }
  const klik = p.get('gclid') || p.get('gbraid') || p.get('wbraid');
  if (klik) h.klik_id = klik.slice(0, 200);
  // Alleen de host. De volledige verwijzer kan een zoekopdracht of een
  // persoonlijke link bevatten, en die hoort niet in onze database.
  const verwijzer = hostVan(document.referrer);
  if (verwijzer) h.verwijzer = verwijzer;
  return h;
}

function magBewaren(): boolean {
  return getConsent()?.analytics === true;
}

function leesOpslag(): Herkomst | null {
  try {
    const ruw = sessionStorage.getItem(SLEUTEL);
    return ruw ? (JSON.parse(ruw) as Herkomst) : null;
  } catch {
    return null;
  }
}

function schrijfOpslag(h: Herkomst): void {
  try { sessionStorage.setItem(SLEUTEL, JSON.stringify(h)); } catch { /* opslag geblokkeerd: geheugen blijft */ }
}

function wisOpslag(): void {
  try { sessionStorage.removeItem(SLEUTEL); } catch { /* niets te wissen */ }
}

/**
 * Leg de ingang vast. Eén keer per pageload aanroepen; daarna doet hij niets.
 *
 * Komt de bezoeker van een andere pagina op deze site en is er niets bewaard,
 * dan is DIT niet de ingang: die lag eerder en is verloren. Dat heet dan
 * `pagina` en niet `ingang`, want een record dat zegt de ingang te zijn terwijl
 * het de derde pagina van het bezoek beschrijft, is precies het soort stille
 * onwaarheid dat een rapportage onbruikbaar maakt.
 */
export function legIngangVast(): void {
  if (typeof window === 'undefined' || geheugen) return;

  const binnenDeSite = hostVan(document.referrer) === zonderWww(location.hostname);

  /**
   * Zonder toestemming niets uit de opslag halen, en wat er nog staat opruimen.
   *
   * Hier stond alleen `leesOpslag()`, onvoorwaardelijk. Schrijven gebeurde al
   * netjes achter `magBewaren()`, maar lezen niet, en de opgeslagen sleutel
   * werd alleen gewist als de bezoeker zijn keuze wijzigde terwijl deze pagina
   * openstond. Wie zijn toestemming op een ander moment introk, werd daarna nog
   * steeds gemeten uit wat er op zijn apparaat stond. Dat is niet wat het
   * cookiebeleid belooft, en het beleid is hier leidend.
   */
  if (!magBewaren()) {
    wisOpslag();
    geheugen = signalenVanDezePagina(binnenDeSite ? 'pagina' : 'ingang');
  } else {
    geheugen = leesOpslag() ?? signalenVanDezePagina(binnenDeSite ? 'pagina' : 'ingang');
    schrijfOpslag(geheugen);
  }

  // Geeft iemand later alsnog toestemming, dan bewaren we de ingang die al in
  // het geheugen stond. Trekt hij hem in, dan gaat de opslag weg.
  if (!luistert) {
    luistert = true;
    onConsentChange((keuze) => {
      if (keuze?.analytics && geheugen) schrijfOpslag(geheugen);
      else if (!keuze?.analytics) wisOpslag();
    });
  }
}

/** De herkomst als tekst, klaar om met een formulier mee te sturen. */
export function herkomstVoorVerzending(): string {
  legIngangVast();
  return JSON.stringify(geheugen ?? signalenVanDezePagina('pagina'));
}
