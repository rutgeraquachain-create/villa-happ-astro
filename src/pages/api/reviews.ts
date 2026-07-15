/**
 * /api/reviews
 *
 * GET  ?slug=<product>  → goedgekeurde reviews + gemiddelde
 * POST { slug, name, rating, text } → review in de moderatiewachtrij
 *
 * Zonder database geeft GET/POST 503; de PDP valt dan terug op
 * localStorage (demo-gedrag).
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase';
import { rateLimit, clientKey, tooManyRequests } from '../../lib/rate-limit';

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
  // PDP geen 503-console-fout logt (Lighthouse best-practices).
  if (!sb) return new Response(JSON.stringify({ reviews: [] }), {
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

  const sb = getSupabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  let body;
  try {
    body = PostSchema.parse(await request.json());
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
