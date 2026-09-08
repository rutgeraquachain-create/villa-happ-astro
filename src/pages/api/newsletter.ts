/**
 * POST /api/newsletter
 * Body: { email: string, source?: string }
 *
 * Stap één van de dubbele opt-in: het adres wordt vastgelegd als onbevestigd en
 * er gaat een bevestigingsmail uit. Pas na de klik in die mail staat iemand op
 * de lijst; zie src/lib/nieuwsbrief.ts voor het waarom.
 *
 * Deze route meldde eerder "Bedankt voor je inschrijving!" zodra het adres was
 * weggeschreven. Dat was onwaar op twee manieren: er was geen bevestiging, en
 * er ging nooit een mail uit. Vier mensen dachten dus dat ze ingeschreven waren
 * en stonden in werkelijkheid op een lijst die niemand mocht gebruiken.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase';
import { rateLimit, clientKey, tooManyRequests } from '../../lib/rate-limit';
import { normaliseerEmail, inschrijfstand, bevestigUrl } from '../../lib/nieuwsbrief';
import { renderNieuwsbriefBevestiging } from '../../lib/mail';
import { zetInWachtrij } from '../../lib/outbox';
import { getSiteOrigin } from '../../lib/site';
import { authSecretOntbreekt } from '../../lib/order-token';
import { magBevestigingVersturen, domeinGeweigerd, schoneBron } from '../../lib/aanmeldrem';
import { isFormulierPost, formulierVelden, geenFormulier } from '../../lib/formulierpost';

export const prerender = false;

const Schema = z.object({
  email: z.email(),
  source: z.string().max(40).optional().default('footer'),
  /**
   * Honeypot. Onzichtbaar voor mensen, ingevuld door bots die elk veld vullen
   * dat ze tegenkomen. Zie de toelichting bij het gebruik verderop.
   */
  bedrijf: z.string().optional(),
});

/**
 * Eén antwoord voor "we hebben je adres, kijk in je mail", ongeacht of het
 * adres nieuw was of al bestond. Zo verklapt de route niet wie er al op de
 * lijst staat; dat is andermans gegeven.
 */
const KIJK_IN_JE_MAIL = {
  success: true,
  message: 'Kijk in je mail en bevestig je aanmelding. Zonder die klik zetten we je niet op de lijst.',
};

export const POST: APIRoute = async ({ request }) => {
  // Van vijf naar drie per minuut. De aanval van 4 september kwam niet van één
  // adres, dus dit houdt hem niet tegen; het is de goedkoopste van de remmen en
  // hij hoort strak te staan. Het echte werk doet `magBevestigingVersturen`.
  if (!rateLimit(clientKey(request, 'newsletter'), 3)) return tooManyRequests();

  /**
   * Alleen formuliergegevens. JSON gaat er niet meer in.
   *
   * WAAROM DIT ER PAS OP 9 SEPTEMBER BIJ KWAM
   * Op 8 september is deze deur gesloten voor /api/herinnering en
   * /api/atelier/claim, en niet hier. Dat was de verkeerde volgorde: dit is
   * juist de route die de bevestigingsmail verstuurt. De bot ging na die twee
   * reparaties gewoon door langs dit adres, en er stonden de volgende ochtend
   * vier nieuwe rijen met adressen als `nedra.steele@fox.com` en
   * `rober.tsbodysh.opp@gmail.com`.
   *
   * Astro weigert formuliergecodeerde berichten van een andere site. Op JSON
   * geldt die controle niet, en dat was de weg naar binnen. Beide formulieren
   * die deze route aanroepen (de voettekst en het polaroidveld op de homepage)
   * sturen sinds deze wijziging een formulier.
   */
  if (!isFormulierPost(request)) {
    return geenFormulier('nieuwsbrief', request.headers.get('content-type') || '');
  }

  let body;
  try {
    const velden = await formulierVelden(request);
    body = Schema.parse({
      email: velden.email ?? '',
      source: velden.source,
      bedrijf: velden.bedrijf,
    });
  } catch {
    return new Response(JSON.stringify({
      success: false,
      message: 'Vul een geldig e-mailadres in.',
    }), { status: 400 });
  }

  /**
   * Honeypot gevuld: dit is een bot. Antwoorden alsof het gelukt is en niets
   * doen. Een foutmelding zou hem laten variëren tot hij er wel doorkomt.
   */
  if (body.bedrijf) {
    console.warn('[nieuwsbrief] Honeypot gevuld; aanmelding genegeerd.');
    return new Response(JSON.stringify(KIJK_IN_JE_MAIL));
  }

  const email = normaliseerEmail(body.email);

  // Sms-gateways en verwanten. Mail daarheen wordt een tekstbericht op iemands
  // telefoon, en dat is bij dit misbruik het doel. Zie lib/aanmeldrem.ts.
  if (domeinGeweigerd(email)) {
    console.warn('[nieuwsbrief] Geweigerd domein; aanmelding genegeerd.');
    return new Response(JSON.stringify(KIJK_IN_JE_MAIL));
  }

  // Zonder secret is er geen bevestigingslink te maken. Vroeg stoppen met een
  // eerlijke melding, anders leggen we een adres vast dat nooit bevestigd kan
  // worden en beloven we een mail die niet komt.
  if (authSecretOntbreekt()) {
    console.error('[nieuwsbrief] AUTH_SECRET ontbreekt; aanmelding geweigerd.');
    return new Response(JSON.stringify({
      success: false,
      message: 'Aanmelden kan nu even niet. Probeer het later opnieuw.',
    }), { status: 503 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    // Geen database = niets opgeslagen. Nooit een inschrijving bevestigen die
    // niet bestaat.
    console.warn('[nieuwsbrief] Geen database; aanmelding NIET opgeslagen voor:', email);
    return new Response(JSON.stringify({
      success: false,
      message: 'Aanmelden kan nog niet. Probeer het later opnieuw.',
    }), { status: 503 });
  }

  const { data: bestaand } = await sb
    .from('newsletter_subscribers')
    .select('confirmed, unsubscribed_at')
    .eq('email', email)
    .maybeSingle();

  const stand = inschrijfstand(bestaand);

  // Al actief: geen tweede bevestigingsmail. Dat leest als spam en het levert
  // niets op.
  if (stand === 'actief') {
    return new Response(JSON.stringify({
      success: true,
      message: 'Je staat al op de lijst. Je hoort vanzelf van ons.',
    }));
  }

  // Eerder uitgeschreven: het adres mag terug, maar alleen via een nieuwe
  // bevestiging. `unsubscribed_at` wordt daarom pas bij die klik gewist.
  const { error } = await sb.from('newsletter_subscribers').upsert({
    email,
    // Door de allowlist heen. Dit veld werd letterlijk overgenomen, dus de bot
    // bepaalde zelf wat er in de kolom kwam: veertig rijen kregen `atelier` mee
    // terwijl geen pagina die waarde stuurt, en daarmee wees de analyse naar
    // het verkeerde kanaal.
    source: schoneBron(body.source),
    confirmed: false,
  }, { onConflict: 'email' });

  if (error) {
    console.error('[nieuwsbrief] Vastleggen mislukte:', error.message);
    return new Response(JSON.stringify({
      success: false,
      message: 'Er ging iets mis. Probeer opnieuw.',
    }), { status: 500 });
  }

  /**
   * De rem die het domein beschermt. Is de bovengrens voor dit uur bereikt, dan
   * staat de aanmelding er wel maar gaat er geen mail uit. Dat is beter dan
   * honderd bevestigingsmails naar mensen die er niet om vroegen, want daar
   * hangt de verzendreputatie aan waarmee de campagne straks moet landen.
   *
   * Het antwoord aan de bezoeker verandert niet. Wie hier legitiem staat en
   * geen mail krijgt, kan het over een uur opnieuw proberen.
   */
  if (!(await magBevestigingVersturen(sb))) {
    return new Response(JSON.stringify(KIJK_IN_JE_MAIL));
  }

  const mail = renderNieuwsbriefBevestiging(email, bevestigUrl(getSiteOrigin(), email));
  const { vastgelegd } = await zetInWachtrij({
    soort: 'nieuwsbrief-bevestiging',
    ontvanger: email,
    onderwerp: mail.subject,
    html: mail.html,
    // Eén bevestigingsverzoek per adres per dag. Zonder deze sleutel kan
    // iemand het formulier tien keer indienen en tien mails veroorzaken bij
    // een adres dat mogelijk niet van hem is.
    dedupeSleutel: `nieuwsbrief-bevestiging:${email}:${new Date().toISOString().slice(0, 10)}`,
  });

  if (!vastgelegd) {
    // Het adres staat er wel, de mail niet. Dat eerlijk melden: anders wacht
    // iemand op een bevestiging die nooit komt.
    console.error('[nieuwsbrief] Bevestigingsmail niet vastgelegd voor:', email);
    return new Response(JSON.stringify({
      success: false,
      message: 'We konden de bevestigingsmail niet versturen. Probeer het later opnieuw.',
    }), { status: 503 });
  }

  return new Response(JSON.stringify(KIJK_IN_JE_MAIL));
};
