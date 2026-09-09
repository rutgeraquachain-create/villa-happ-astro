/**
 * /api/reviews
 *
 * GET  ?slug=<product>  → goedgekeurde reviews + gemiddelde
 * POST { slug, name, rating, text } → review in de moderatiewachtrij
 *
 * Zonder database geeft GET een 200 met `demo: true` (geen 503, dat gaf een
 * console-fout die de Lighthouse best-practices-score drukte). Die vlag is
 * het signaal voor de PDP om terug te vallen op localStorage: POST kán dan
 * namelijk niet slagen. Laat de vlag dus staan zolang GET 200 teruggeeft.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase';
import { rateLimit, clientKey, tooManyRequests } from '../../lib/rate-limit';
import { isFormulierPost, formulierVelden, geenFormulier } from '../../lib/formulierpost';

export const prerender = false;

const PostSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(40),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(3).max(500),
});

export const GET: APIRoute = async ({ url }) => {
  const sb = getSupabaseAdmin();
  // Zonder database (demo/preview): 200 met lege lijst i.p.v. 503, zodat de
  // PDP geen 503-console-fout logt (Lighthouse best-practices). `demo: true`
  // vertelt de PDP dat schrijven hier niet gaat — zonder die vlag denkt hij
  // dat de server meedoet en loopt elke ingestuurde review op een 503 stuk.
  if (!sb) return new Response(JSON.stringify({ reviews: [], demo: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });

  const slug = url.searchParams.get('slug') || '';
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return new Response(JSON.stringify({ error: 'invalid slug' }), { status: 400 });
  }

  const { data, error } = await sb
    .from('product_reviews')
    .select('name, rating, body, created_at')
    .eq('product_slug', slug)
    .eq('approved', true)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return new Response(JSON.stringify({ error: 'query failed' }), { status: 500 });

  return new Response(JSON.stringify({ reviews: data || [] }), {
    headers: {
      'Content-Type': 'application/json',
      // Edge-cache: reviews hoeven niet realtime te zijn
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  if (!rateLimit(clientKey(request, 'reviews'), 3)) return tooManyRequests();

  // Alleen via het formulier, en vóór de database. Zie src/lib/formulierpost.ts.
  if (!isFormulierPost(request)) {
    return geenFormulier('reviews', request.headers.get('content-type') || '', 'error');
  }

  const sb = getSupabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  let body;
  try {
    const velden = await formulierVelden(request);
    // Honeypot: gevuld betekent bot. Doen alsof het gelukt is en niets opslaan.
    if (velden.bedrijf) {
      console.warn('[reviews] Honeypot gevuld; review genegeerd.');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    body = PostSchema.parse({
      slug: velden.slug,
      name: velden.name ?? '',
      // Een formulierveld is altijd tekst; het schema wil een getal.
      rating: Number(velden.rating),
      text: velden.text ?? '',
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Ongeldige review.' }), { status: 400 });
  }

  const { error } = await sb.from('product_reviews').insert({
    product_slug: body.slug,
    name: body.name,
    rating: body.rating,
    body: body.text,
    approved: false, // moderatie: eerst controleren, dan live
  });

  if (error) return new Response(JSON.stringify({ error: 'Opslaan mislukte.' }), { status: 500 });

  return new Response(JSON.stringify({ success: true, pending: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
