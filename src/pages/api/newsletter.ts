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

export const prerender = false;

const Schema = z.object({
  email: z.email(),
  source: z.string().max(40).optional().default('footer'),
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
  if (!rateLimit(clientKey(request, 'newsletter'), 5)) return tooManyRequests();

  let body;
  try {
    body = Schema.parse(await request.json());
  } catch {
    return new Response(JSON.stringify({
      success: false,
      message: 'Vul een geldig e-mailadres in.',
    }), { status: 400 });
  }

  const email = normaliseerEmail(body.email);

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
    source: body.source,
    confirmed: false,
  }, { onConflict: 'email' });

  if (error) {
    console.error('[nieuwsbrief] Vastleggen mislukte:', error.message);
    return new Response(JSON.stringify({
      success: false,
      message: 'Er ging iets mis. Probeer opnieuw.',
    }), { status: 500 });
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
