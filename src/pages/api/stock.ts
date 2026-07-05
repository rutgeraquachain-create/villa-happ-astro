/**
 * GET /api/stock?slug=<product> — actuele voorraad per variant
 *
 * De PDP's zijn geprerenderd; de voorraad daarop bevriest dus op
 * build-moment. Dit endpoint levert de actuele stand zodat de PDP
 * zichzelf bij bezoek ververst (maatknoppen, schaarste-balk,
 * uitverkocht-status). Zonder database 503; de PDP houdt dan gewoon
 * de gebakken demo-waarden.
 */

import type { APIRoute } from 'astro';
import { getSupabase } from '../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const sb = getSupabase(); // anon client volstaat: voorraad is publiek leesbaar (RLS)
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  const slug = url.searchParams.get('slug') || '';
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return new Response(JSON.stringify({ error: 'invalid slug' }), { status: 400 });
  }

  const { data, error } = await sb
    .from('products')
    .select('slug, product_variants(id, inventory(quantity, reserved))')
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  if (error || !data) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });

  const variants = ((data as any).product_variants || []).map((v: any) => {
    const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
    return {
      id: v.id,
      stock: inv ? Math.max(0, (inv.quantity || 0) - (inv.reserved || 0)) : 0,
    };
  });

  return new Response(JSON.stringify({ variants }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Kort edge-cachen: vers genoeg voor drops, zonder DB-hammering
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
    },
  });
};
