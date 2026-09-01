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

/** Hoeveel adressen we per aanroep in de wachtrij zetten. */
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

export interface MailingUitslag {
  /** Hoeveel adressen er in de lijst zaten. */
  ontvangers: number;
  /** Hoeveel rijen daadwerkelijk zijn vastgelegd (nieuw of al aanwezig). */
  vastgelegd: number;
  /** Hoeveel er niet konden worden vastgelegd; die krijgen niets. */
  mislukt: number;
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
    return { ontvangers: 0, vastgelegd: 0, mislukt: 0 };
  }

  const origin = getSiteOrigin();
  const adressen = opties.alleenNaar
    ? [normaliseerEmail(opties.alleenNaar)]
    : await verzendlijst(sb);

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

  return { ontvangers: adressen.length, vastgelegd, mislukt };
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

  const lijst = (await verzendlijst(sb, 10_000)).length;

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
