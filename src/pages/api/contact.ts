/**
 * POST /api/contact — bericht via het contactformulier
 *
 * Body: { name, email, subject, message, company? }
 *
 * `company` is een honeypot: het veld staat verborgen in het formulier, dus
 * alleen bots vullen het. Is het gevuld, dan doen we alsof het gelukt is en
 * versturen we niets.
 *
 * Zonder RESEND_API_KEY geeft deze route 503. De pagina toont dan een
 * eerlijke melding met een mailto-alternatief — nooit een bevestiging voor
 * een bericht dat niet verstuurd is.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { sendContactMessage, isMailConfigured } from '../../lib/mail';
import { BUSINESS } from '../../lib/business';
import { rateLimit, clientKey, tooManyRequests } from '../../lib/rate-limit';
import { isFormulierPost, formulierVelden, geenFormulier } from '../../lib/formulierpost';

export const prerender = false;

const Schema = z.object({
  name: z.string().min(1).max(80),
  email: z.email(),
  subject: z.string().min(1).max(40),
  message: z.string().min(5).max(4000),
  company: z.string().max(100).optional(), // honeypot
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!rateLimit(clientKey(request, 'contact'), 3)) return tooManyRequests();

  // Alleen via het formulier. Zie src/lib/formulierpost.ts.
  if (!isFormulierPost(request)) {
    return geenFormulier('contact', request.headers.get('content-type') || '', 'error');
  }

  let body;
  try {
    const velden = await formulierVelden(request);
    body = Schema.parse({
      name: velden.name ?? '',
      email: velden.email ?? '',
      subject: velden.subject ?? '',
      message: velden.message ?? '',
      company: velden.company,
    });
  } catch {
    return json({ success: false, error: 'Controleer je gegevens en probeer het opnieuw.' }, 400);
  }

  // Bot: stilletjes slikken, geen signaal teruggeven
  if (body.company) return json({ success: true });

  if (!isMailConfigured()) {
    return json({
      success: false,
      error: 'Het contactformulier is nog niet actief.',
      mailto: BUSINESS.supportEmail,
    }, 503);
  }

  const sent = await sendContactMessage(
    { name: body.name, email: body.email, subject: body.subject, message: body.message },
    BUSINESS.supportEmail,
  ).catch((err) => {
    console.error('[contact] versturen faalde:', err);
    return false;
  });

  if (!sent) {
    return json({
      success: false,
      error: 'Versturen lukte niet.',
      mailto: BUSINESS.supportEmail,
    }, 502);
  }

  return json({ success: true });
};
