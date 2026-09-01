/**
 * POST /api/newsletter/afmelden
 * Body: { t: string }  of  formulierveld `t`
 *
 * Schrijft een adres uit. Bewust POST en geen GET: mailscanners en
 * link-vooruitkijkers halen elke URL in een bericht op, en een GET zou mensen
 * ongemerkt van de lijst halen. Dat merkt niemand, aan geen van beide kanten.
 *
 * Deze route is ook het doel van de `List-Unsubscribe`-header met
 * `List-Unsubscribe-Post` (RFC 8058). Gmail en Outlook tonen dan hun eigen
 * uitschrijfknop en sturen daar een POST heen. Antwoord daarom altijd met een
 * 200 zodra het adres uit een geldig token komt, ook als er niets te wijzigen
 * viel: die clients tonen een foutmelding aan de ontvanger bij alles wat geen
 * 200 is, terwijl er voor hem niets mis is.
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
    // Zowel het formulier op de afmeldpagina als de one-click-knop van Gmail
    // stuurt formuliergecodeerde velden.
    const form = await request.formData();
    const t = form.get('t');
    return typeof t === 'string' ? t : null;
  } catch {
    return null;
  }
}

export const POST: APIRoute = async ({ request, url }) => {
  // Het token mag ook in de query staan: de List-Unsubscribe-header is één URL
  // en draagt geen body.
  const token = (await leesToken(request)) || url.searchParams.get('t');
  const email = emailUitToken(token, 'afmelding');

  if (!email) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Deze uitschrijflink klopt niet.',
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    console.error('[nieuwsbrief] Geen database; uitschrijven mislukt voor:', email);
    return new Response(JSON.stringify({
      success: false,
      message: 'Uitschrijven lukte niet. Probeer het zo opnieuw of mail ons.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  const { error } = await sb
    .from('newsletter_subscribers')
    .update({ unsubscribed_at: new Date().toISOString(), confirmed: false })
    .eq('email', email);

  if (error) {
    console.error('[nieuwsbrief] Uitschrijven mislukte:', error.message);
    return new Response(JSON.stringify({
      success: false,
      message: 'Uitschrijven lukte niet. Probeer het zo opnieuw of mail ons.',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ success: true, email }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
