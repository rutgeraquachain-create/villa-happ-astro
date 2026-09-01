/**
 * Villa Happ — nieuwsbrief: adressen, links en de toestand van een inschrijving
 *
 * Puur en zonder I/O, zodat de regels los te testen zijn van de database.
 *
 * WAAROM DUBBELE OPT-IN
 * ---------------------
 * Een formulierinzending is zwak bewijs van toestemming: iedereen kan andermans
 * adres invullen. De AVG vraagt om aantoonbare toestemming, en dat bewijs is een
 * klik vanuit het postvak zelf. Zonder die stap kun je een lijst wel opbouwen,
 * maar niet verantwoord gebruiken.
 *
 * Het kost inschrijvingen. Dat is de prijs, en die is bewust betaald: een lijst
 * die je niet mag aanschrijven is nul waard, hoe lang hij ook is.
 */

import { maakToken, leesToken } from './order-token';

/**
 * Eén schrijfwijze per adres.
 *
 * Het domeindeel is hoofdletterongevoelig, het lokale deel formeel niet, maar
 * geen enkele mailprovider die wij tegenkomen maakt dat onderscheid. Zonder
 * normaliseren levert "Geoffrey@..." een tweede rij op naast "geoffrey@...",
 * en dan staat iemand twee keer op de lijst en schrijft hij zich maar één keer uit.
 */
export function normaliseerEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * De toestand van een inschrijving, afgeleid uit de twee kolommen die hem
 * bepalen. Als functie en niet als losse if-jes per aanroepplek, want de
 * volgorde telt: uitgeschreven wint altijd van bevestigd.
 */
export type Inschrijfstand = 'nieuw' | 'wacht-op-bevestiging' | 'actief' | 'uitgeschreven';

export function inschrijfstand(rij: {
  confirmed?: boolean | null;
  unsubscribed_at?: string | null;
} | null | undefined): Inschrijfstand {
  if (!rij) return 'nieuw';
  // Eerst uitschrijven controleren. Iemand die zich uitschreef en daarna per
  // ongeluk het formulier opnieuw invult, mag niet stilzwijgend terugkomen.
  if (rij.unsubscribed_at) return 'uitgeschreven';
  return rij.confirmed ? 'actief' : 'wacht-op-bevestiging';
}

/** Mag deze inschrijving een mailing ontvangen? */
export function magOntvangen(rij: Parameters<typeof inschrijfstand>[0]): boolean {
  return inschrijfstand(rij) === 'actief';
}

/**
 * De link uit de bevestigingsmail.
 *
 * Bewust een gewone link die bij het openen meteen bevestigt, zonder knop op de
 * bestemming. Sommige mailscanners volgen links vooraf en bevestigen daarmee
 * een inschrijving die de mens nog niet aanklikte. Dat weegt hier niet op tegen
 * het alternatief: elke extra stap kost bevestigingen, en de persoon vulde het
 * formulier zelf al in. Bij uitschrijven ligt die afweging andersom, zie hieronder.
 */
export function bevestigUrl(origin: string, email: string, nu?: number): string {
  const token = maakToken(normaliseerEmail(email), 'aanmelding', nu);
  return `${origin}/nieuwsbrief/bevestigen?t=${encodeURIComponent(token)}`;
}

/**
 * De uitschrijflink onder elke mailing.
 *
 * Deze bestemming schrijft níét meteen uit; hij toont een knop die POST doet.
 * Een mailscanner die links vooruit ophaalt zou anders iemand ongemerkt van de
 * lijst halen, en dat merkt niemand: de ontvanger niet, wij niet. Een gemiste
 * mailing is stille schade, een klik extra is dat niet.
 */
export function afmeldUrl(origin: string, email: string, nu?: number): string {
  return `${origin}/nieuwsbrief/afmelden?t=${encodeURIComponent(afmeldToken(email, nu))}`;
}

/**
 * Het kale uitschrijftoken.
 *
 * Bestaat apart omdat er twee bestemmingen zijn met hetzelfde token: de pagina
 * met de knop (`afmeldUrl`) en het API-adres waar de uitschrijfknop van Gmail
 * een POST heen stuurt. Die tweede uit de eerste terugrekenen door op "t=" te
 * splitsen werkte wel, maar breekt zodra er ooit een parameter bij komt.
 */
export function afmeldToken(email: string, nu?: number): string {
  return maakToken(normaliseerEmail(email), 'afmelding', nu);
}

/** Leest het adres uit een aanmeldings- of afmeldingstoken. Null = ongeldig. */
export function emailUitToken(
  token: string | undefined | null,
  publiek: 'aanmelding' | 'afmelding',
  nu?: number,
): string | null {
  const inhoud = leesToken(token, publiek, nu);
  if (!inhoud) return null;
  const email = normaliseerEmail(inhoud.onderwerp);
  // Een token is ondertekend, dus dit kan alleen misgaan als wij zelf ooit iets
  // anders dan een adres ondertekenen. Dan liever niets doen dan een lege rij raken.
  return email.includes('@') ? email : null;
}
