/**
 * POST /api/atelier/claim — claim je nummer in de oplage
 *
 * Body: { email, name?, colour? }
 * Kent een nummer toe in de genummerde oplage, schrijft de claim weg en
 * schrijft het e-mailadres in voor de nieuwsbrief/drop. Idempotent: wie
 * al geclaimd heeft, krijgt hetzelfde nummer terug.
 *
 * Zonder database 503; het Atelier valt dan terug op een lokaal
 * gegenereerd nummer (demo-gedrag, net als reviews/back-in-stock).
 */

import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { rateLimit, clientKey, tooManyRequests } from '../../../lib/rate-limit';
import { ClaimSchema, nextNumber, EDITION } from '../../../lib/atelier';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!rateLimit(clientKey(request, 'atelier'), 5)) return tooManyRequests();

  const sb = getSupabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  let body;
  try {
    body = ClaimSchema.parse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Vul een geldig e-mailadres in.' }), { status: 400 });
  }

  // Al geclaimd? Geef hetzelfde nummer terug (idempotent).
  const { data: bestaand } = await sb
    .from('atelier_claims')
    .select('number, edition')
    .eq('email', body.email)
    .maybeSingle();

  if (bestaand) {
    return new Response(JSON.stringify({ number: bestaand.number, edition: bestaand.edition, returning: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { count } = await sb.from('atelier_claims').select('*', { count: 'exact', head: true });
  const number = nextNumber(count || 0);

  const { error } = await sb.from('atelier_claims').insert({
    email: body.email,
    name: body.name,
    garment: body.garment,
    colour: body.colour,
    initials: body.initials,
    number,
    edition: EDITION,
  });

  // Botsing (iemand claimde net gelijktijdig): lees het bestaande nummer terug.
  if (error) {
    const { data: retry } = await sb
      .from('atelier_claims')
      .select('number, edition')
      .eq('email', body.email)
      .maybeSingle();
    if (retry) {
      return new Response(JSON.stringify({ number: retry.number, edition: retry.edition, returning: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Claimen mislukte, probeer opnieuw.' }), { status: 500 });
  }

  // Inschrijven voor de drop/nieuwsbrief (faalt nooit hard).
  await sb.from('newsletter_subscribers')
    .upsert({ email: body.email, source: 'atelier' }, { onConflict: 'email' })
    .then(() => null, () => null);

  return new Response(JSON.stringify({ number, edition: EDITION }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
