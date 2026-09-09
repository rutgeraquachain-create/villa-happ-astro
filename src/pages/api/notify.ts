/**
 * POST /api/notify — back-in-stock melding
 * Body: { slug, size, email }
 *
 * Zonder database 503; de PDP valt dan terug op localStorage.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase';
import { rateLimit, clientKey, tooManyRequests } from '../../lib/rate-limit';
import { isFormulierPost, formulierVelden, geenFormulier } from '../../lib/formulierpost';
import { checkBotId } from 'botid/server';
import { geweigerdDoorBotId } from '../../lib/botid-routes';

export const prerender = false;

const Schema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  size: z.string().max(20).optional().default(''),
  email: z.email(),
});

export const POST: APIRoute = async ({ request }) => {
  if (!rateLimit(clientKey(request, 'notify'), 5)) return tooManyRequests();

  // Alleen via het formulier, en vóór de database. Wie het adres rechtstreeks
  // aanroept hoort geen 503 te krijgen die iets over onze opzet verklapt, en
  // een geweigerd verzoek hoort niets te kosten. Zie src/lib/formulierpost.ts.
  if (!isFormulierPost(request)) {
    return geenFormulier('voorraadmelding', request.headers.get('content-type') || '', 'error');
  }

  // BotID ná de goedkope controle hierboven; zie src/lib/botid-routes.ts.
  if ((await checkBotId()).isBot) return geweigerdDoorBotId('voorraadmelding', 'error');

  const sb = getSupabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  let body;
  try {
    const velden = await formulierVelden(request);
    body = Schema.parse({ slug: velden.slug, size: velden.size, email: velden.email ?? '' });
    // Honeypot: gevuld betekent bot. Doen alsof het gelukt is en niets doen.
    if (velden.bedrijf) {
      console.warn('[voorraadmelding] Honeypot gevuld; melding genegeerd.');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
  } catch {
    return new Response(JSON.stringify({ error: 'Vul een geldig e-mailadres in.' }), { status: 400 });
  }

  const { error } = await sb.from('back_in_stock').upsert({
    product_slug: body.slug,
    size: body.size,
    email: body.email,
  }, { onConflict: 'product_slug,size,email' });

  if (error) return new Response(JSON.stringify({ error: 'Opslaan mislukte.' }), { status: 500 });

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
