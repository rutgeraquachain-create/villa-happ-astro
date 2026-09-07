/**
 * POST /api/newsletter/bevestigen
 * Body: { t: string }  of formulierveld `t`
 *
 * Stap twee van de dubbele opt-in, nu als POST.
 *
 * WAAROM DIT GEEN GET MEER IS
 * ---------------------------
 * De bevestigingslink bevestigde eerder bij het openen. Bij `bevestigUrl` in
 * lib/nieuwsbrief.ts stond die keuze uitgeschreven, met de aantekening dat
 * mailscanners links vooruit ophalen en daarmee zouden kunnen bevestigen. Die
 * afweging viel toen uit op gemak: elke extra stap kost bevestigingen.
 *
 * Gemeten 7 september 2026 sneuvelde die aanname. Van de negen bevestigde
 * inschrijvingen kwam er niet één van een consumentenadres. Alle negen kwamen
 * van zakelijke domeinen met een mailfilter, en zes ervan bevestigden binnen een
 * minuut na verzending, één binnen drie seconden:
 *
 *     wagnerlogistics.com    3 s
 *     state.gov             24 s
 *     nbbj.com              28 s
 *     omegamorgan.com       49 s
 *
 * Dat zijn scanners, geen mensen. Het gevolg is erger dan een verkeerd getal:
 * die adressen stonden als "bevestigd" op de lijst en zouden in oktober een
 * mailing hebben gekregen die niemand daar had aangevraagd.
 *
 * Bij het uitschrijven viel dezelfde afweging altijd al andersom uit, en de
 * reden staat er: stille schade weegt zwaarder dan een klik extra. Dat geldt
 * hier net zo goed.
 */

import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { emailUitToken } from '../../../lib/nieuwsbrief';

export const prerender = false;

async function leesToken(request: Request): Promise<string | null> {
  const type = request.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) {
      const body = await request.json();
      return typeof body?.t === 'string' ? body.t : null;
    }
    const form = await request.formData();
    const t = form.get('t');
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

function antwoord(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, url }) => {
  const token = (await leesToken(request)) || url.searchParams.get('t');
  const email = emailUitToken(token, 'aanmelding');

  if (!email) {
    return antwoord({ success: false, uitslag: 'ongeldig' }, 400);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error('[nieuwsbrief] Geen database; bevestigen mislukt voor:', email);
    return antwoord({ success: false, uitslag: 'geen-database' }, 503);
  }

  const { data: bestaand } = await sb
    .from('newsletter_subscribers')
    .select('confirmed, unsubscribed_at')
    .eq('email', email)
    .maybeSingle();

  if (bestaand?.confirmed && !bestaand.unsubscribed_at) {
    return antwoord({ success: true, uitslag: 'al-actief', email });
  }

  // `unsubscribed_at` wordt hier gewist: wie zich eerder uitschreef en nu
  // opnieuw bevestigt, kiest daar bewust voor.
  const { error } = await sb
    .from('newsletter_subscribers')
    .update({ confirmed: true, confirmed_at: new Date().toISOString(), unsubscribed_at: null })
    .eq('email', email);

  if (error) {
    console.error('[nieuwsbrief] Bevestigen mislukte:', error.message);
    return antwoord({ success: false, uitslag: 'geen-database' }, 503);
  }

  return antwoord({ success: true, uitslag: 'gelukt', email });
};
