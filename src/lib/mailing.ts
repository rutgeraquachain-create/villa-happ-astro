/**
 * Villa Happ — een mailing naar de lijst versturen
 *
 * Bouwt bewust niets nieuws om te versturen. Een mailing is hier één rij per
 * ontvanger in de bestaande outbox, en die zorgt daarna voor de herpogingen,
 * de dedup en de koppeling met de afleverwebhook. Alles wat de transactiemail
 * al betrouwbaar maakt, geldt daarmee ook hier.
 *
 * DRIE DINGEN DIE HIER NIET MOGEN MISGAAN
 * ---------------------------------------
 *  1. **Niemand krijgt hem twee keer.** De dedupe-sleutel is
 *     `mailing:<slug>:<adres>` met een unieke index eronder. Twee keer op de
 *     knop drukken levert dus nul extra mail op, niet een tweede lading.
 *  2. **Alleen wie ervoor koos.** De verzendlijst is één query, hier en nergens
 *     anders geformuleerd: bevestigd én niet uitgeschreven. Zie
 *     `verzendlijst()`.
 *  3. **Iedereen kan eruit.** Elke mail draagt `List-Unsubscribe` met een
 *     token dat alleen voor dat adres werkt. Zonder die kopregel tonen Gmail
 *     en Outlook hun uitschrijfknop niet en drukken mensen op "spam", wat je
 *     afzenderreputatie voor alle volgende mail verpest.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { zetInWachtrij } from './outbox';
import { afmeldUrl, afmeldToken, normaliseerEmail } from './nieuwsbrief';
import { getSiteOrigin } from './site';

/**
 * Hoeveel adressen we per aanroep in de wachtrij zetten.
 *
 * DIT WAS EEN PLAFOND EN GEEN PORTIE. GEMETEN 12 SEPTEMBER 2026.
 * `zetMailingKlaar` riep `verzendlijst(sb)` aan zonder tweede argument en die
 * pakt de eerste 200 op `created_at` oplopend. Wie als 201e op de lijst stond
 * kreeg de mailing nooit, en een tweede klik op de knop hielp niet: dezelfde
 * query gaf dezelfde eerste 200 terug, die allemaal op hun dedupe-sleutel
 * afketsten. Geen foutmelding, geen rode toets, alleen mensen die niets kregen.
 * Precies waar deze campagne de lijst voor laat groeien.
 *
 * Nu is het wél een portie: `verzendlijst` laat weg wie voor deze mailing al
 * een rij heeft, dus elke volgende aanroep schuift op. `resterend` in de uitslag
 * zegt hoeveel er nog wachten, zodat het beheerscherm het verschil kan tonen in
 * plaats van het te verzwijgen.
 */
const BATCH = 200;

export interface Mailing {
  /** Vaste naam, ook de basis van de dedupe-sleutel. Nooit hergebruiken. */
  slug: string;
  onderwerp: string;
  /** Volledige HTML, al opgemaakt. Zonder uitschrijflink: die komt hier erbij. */
  html: string;
}

/**
 * De kopregels die van een mail een nette bulkzending maken.
 *
 * `List-Unsubscribe-Post` is wat Gmail nodig heeft om zijn eigen knop te tonen
 * (RFC 8058). Die knop stuurt een POST naar de URL hieronder, en daarvoor staat
 * `/api/newsletter/afmelden` in VRIJGESTELDE_PADEN van de herkomstcontrole.
 * Zonder die vrijstelling krijgt de knop een 403.
 */
export function mailingKopregels(origin: string, email: string): Record<string, string> {
  const url = `${origin}/api/newsletter/afmelden?t=${encodeURIComponent(afmeldToken(email))}`;
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * Wie krijgt de mailing. Eén formulering, zodat niemand hem per ongeluk anders
 * opschrijft en de lijst stilletjes groter wordt dan hij mag zijn.
 */
export async function verzendlijst(sb: SupabaseClient, limiet = BATCH): Promise<string[]> {
  const { data, error } = await sb
    .from('newsletter_subscribers')
    .select('email')
    .eq('confirmed', true)
    .is('unsubscribed_at', null)
    .order('created_at', { ascending: true })
    .limit(limiet);

  if (error) {
    console.error('[mailing] Verzendlijst ophalen mislukte:', error.message);
    return [];
  }
  return (data || []).map((r: { email: string }) => normaliseerEmail(r.email));
}

/** Zo veel adressen halen we per query op bij het doorlopen van de lijst. */
const PAGINA = 1000;

/** Zo ver kijken we terug in de wachtrij naar wie deze mailing al heeft. */
const MAX_AL_GEHAD = 50_000;

/**
 * Wie deze mailing nog niet heeft, en hoeveel er daarna nog wachten.
 *
 * De wachtrij is hier de boekhouding: staat er een rij `mailing:<slug>` voor een
 * adres, dan is die mail klaargezet en hoeft hij niet nog eens. Dat is dezelfde
 * waarheid als de dedupe-sleutel gebruikt, alleen vooraf gelezen in plaats van
 * achteraf tegen een unieke index aangelopen. Zonder dit bleef elke aanroep op
 * dezelfde eerste 200 adressen hangen.
 */
export async function nogTeVerzenden(
  sb: SupabaseClient,
  slug: string,
  limiet = BATCH,
): Promise<{ adressen: string[]; resterend: number; volledig: boolean }> {
  const { data: alGehad, error: wachtrijFout } = await sb
    .from('uitgaande_mail')
    .select('ontvanger')
    .eq('soort', `mailing:${slug}`)
    .limit(MAX_AL_GEHAD);

  if (wachtrijFout) {
    // Niet weten wie hem al heeft is geen reden om iedereen opnieuw te mailen.
    console.error('[mailing] Wachtrij lezen mislukte:', wachtrijFout.message);
    return { adressen: [], resterend: 0, volledig: false };
  }

  const gehad = new Set(
    (alGehad || []).map((r: { ontvanger: string }) => normaliseerEmail(r.ontvanger)),
  );

  const adressen: string[] = [];
  let resterend = 0;
  let vanaf = 0;
  let volledig = true;

  // Doorlopen tot de lijst op is. We stoppen niet zodra `limiet` vol is: de rest
  // van de pagina's telt door voor `resterend`, want een teller die stopt met
  // tellen zodra hij genoeg heeft, meldt een achterstand van nul.
  for (;;) {
    const { data, error } = await sb
      .from('newsletter_subscribers')
      .select('email')
      .eq('confirmed', true)
      .is('unsubscribed_at', null)
      .order('created_at', { ascending: true })
      .range(vanaf, vanaf + PAGINA - 1);

    if (error) {
      console.error('[mailing] Verzendlijst ophalen mislukte:', error.message);
      return { adressen, resterend, volledig: false };
    }

    for (const rij of data || []) {
      const email = normaliseerEmail((rij as { email: string }).email);
      if (gehad.has(email)) continue;
      // Dubbele adressen binnen één ronde: de unieke index vangt ze, maar dan
      // telt `mislukt` op iets dat geen fout is.
      if (adressen.includes(email)) continue;
      if (adressen.length < limiet) adressen.push(email);
      else resterend++;
    }

    if (!data || data.length < PAGINA) break;
    vanaf += PAGINA;
    if (vanaf >= MAX_AL_GEHAD) {
      // Zo lang is deze lijst nooit geweest. Gebeurt het toch, dan is stil
      // afkappen het laatste wat je wilt.
      console.error('[mailing] Lijst langer dan', MAX_AL_GEHAD, 'adressen; rest niet geteld.');
      volledig = false;
      break;
    }
  }

  return { adressen, resterend, volledig };
}

export interface MailingUitslag {
  /** Hoeveel adressen er in de lijst zaten. */
  ontvangers: number;
  /** Hoeveel rijen daadwerkelijk zijn vastgelegd (nieuw of al aanwezig). */
  vastgelegd: number;
  /** Hoeveel er niet konden worden vastgelegd; die krijgen niets. */
  mislukt: number;
  /**
   * Hoeveel er na deze ronde nog wachten. Boven nul betekent: druk nog een keer
   * op de knop. Dit veld bestaat omdat het oude gedrag er niet was: de zending
   * stopte bij 200 zonder dat iets dat zei.
   */
  resterend: number;
}

/**
 * Zet de mailing klaar voor de hele lijst.
 *
 * Verstuurt niet zelf. De outbox probeert elke rij meteen, en wat niet lukt
 * blijft staan met oplopende backoff. Bij honderden adressen is dat precies wat
 * je wilt: de aanroep valt niet om op een tijdslimiet, en niets gaat verloren.
 *
 * `alleenNaar` beperkt de zending tot één adres. Dat is de proefzending, en die
 * gebruikt bewust dezelfde route als het echte werk: een proef die langs een
 * ander pad loopt bewijst niets over het pad dat straks gebruikt wordt.
 */
export async function zetMailingKlaar(
  mailing: Mailing,
  opties: { alleenNaar?: string } = {},
): Promise<MailingUitslag> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error('[mailing] Geen database; mailing niet klaargezet:', mailing.slug);
    return { ontvangers: 0, vastgelegd: 0, mislukt: 0, resterend: 0 };
  }

  const origin = getSiteOrigin();
  const ronde = opties.alleenNaar
    ? { adressen: [normaliseerEmail(opties.alleenNaar)], resterend: 0 }
    : await nogTeVerzenden(sb, mailing.slug);
  const adressen = ronde.adressen;

  let vastgelegd = 0;
  let mislukt = 0;

  for (const email of adressen) {
    const uitslag = await zetInWachtrij({
      soort: `mailing:${mailing.slug}`,
      ontvanger: email,
      onderwerp: mailing.onderwerp,
      html: mailing.html.replace(/\{\{afmeldlink\}\}/g, afmeldUrl(origin, email)),
      // De proefzending krijgt een eigen sleutel, anders blokkeert hij de
      // echte zending naar datzelfde adres.
      dedupeSleutel: opties.alleenNaar
        ? `mailing:${mailing.slug}:proef:${email}:${Date.now()}`
        : `mailing:${mailing.slug}:${email}`,
      kopregels: mailingKopregels(origin, email),
    });
    uitslag.vastgelegd ? vastgelegd++ : mislukt++;
  }

  return { ontvangers: adressen.length, vastgelegd, mislukt, resterend: ronde.resterend };
}

/** Hoeveel mensen zouden deze mailing krijgen, en hoeveel kregen hem al? */
export async function mailingStand(slug: string): Promise<{
  lijst: number;
  alKlaargezet: number;
  verzonden: number;
  mislukt: number;
}> {
  const sb = getSupabaseAdmin();
  if (!sb) return { lijst: 0, alKlaargezet: 0, verzonden: 0, mislukt: 0 };

  /**
   * Tellen, niet ophalen en de rijen optellen.
   *
   * Hier stond `verzendlijst(sb, 10_000).length`. Dat is geen telling maar een
   * plafond: bij meer dan tienduizend adressen was het antwoord tienduizend, en
   * niemand had gezien waar dat getal vandaan kwam.
   */
  const { count, error: telFout } = await sb
    .from('newsletter_subscribers')
    .select('email', { count: 'exact', head: true })
    .eq('confirmed', true)
    .is('unsubscribed_at', null);
  if (telFout) console.error('[mailing] Lijst tellen mislukte:', telFout.message);
  const lijst = count ?? 0;

  const { data } = await sb
    .from('uitgaande_mail')
    .select('status')
    .eq('soort', `mailing:${slug}`);

  const rijen = data || [];
  return {
    lijst,
    alKlaargezet: rijen.length,
    verzonden: rijen.filter((r: { status: string }) => r.status === 'verzonden').length,
    mislukt: rijen.filter((r: { status: string }) => r.status === 'opgegeven').length,
  };
}
