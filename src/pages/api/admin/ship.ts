/**
 * POST /api/admin/ship — order op verzonden zetten + verzendbevestiging
 *
 * Body: { order_number, tracking_number, carrier? }
 * Auth: Authorization: Bearer <ADMIN_API_SECRET>
 *
 * Idempotent: een order die al verzonden is wordt niet nogmaals
 * bijgewerkt en de klant krijgt niet nogmaals mail.
 *
 * Voorbeeld:
 *   curl -X POST https://<site>/api/admin/ship \
 *     -H "Authorization: Bearer $ADMIN_API_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"order_number":"VH-2026-00012","tracking_number":"3SVHXX123456789"}'
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { sendShippingConfirmation } from '../../../lib/mail';

export const prerender = false;

const Schema = z.object({
  order_number: z.string().min(1).max(30),
  tracking_number: z.string().min(4).max(40),
  carrier: z.string().max(30).optional().default('PostNL'),
});

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.ADMIN_API_SECRET;
  if (!secret) return new Response(JSON.stringify({ error: 'ADMIN_API_SECRET niet geconfigureerd' }), { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  let body;
  try {
    body = Schema.parse(await request.json());
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Invalid request', details: err?.issues }), { status: 400 });
  }

  const { data: order } = await sb
    .from('orders')
    .select('id, order_number, status, payment_status, customer_email, customer_name, shipping_address, tracking_number')
    .eq('order_number', body.order_number)
    .single();

  if (!order) return new Response(JSON.stringify({ error: 'Order niet gevonden.' }), { status: 404 });
  if (order.payment_status !== 'paid') {
    return new Response(JSON.stringify({ error: `Order is niet betaald (payment_status: ${order.payment_status}).` }), { status: 409 });
  }
  if (order.status === 'shipped' || order.status === 'delivered') {
    return new Response(JSON.stringify({ success: true, already_shipped: true, order_number: order.order_number }), { status: 200 });
  }

  const { error: upErr } = await sb.from('orders').update({
    status: 'shipped',
    shipped_at: new Date().toISOString(),
    tracking_number: body.tracking_number,
    tracking_carrier: body.carrier,
  }).eq('id', order.id);

  if (upErr) return new Response(JSON.stringify({ error: 'Bijwerken mislukte.' }), { status: 500 });

  const mailed = await sendShippingConfirmation({
    order_number: order.order_number,
    customer_email: order.customer_email,
    customer_name: order.customer_name,
    tracking_number: body.tracking_number,
    tracking_carrier: body.carrier,
    shipping_address: order.shipping_address,
  }).catch((err) => {
    console.error('[ship] verzendbevestiging faalde:', err);
    return false;
  });

  return new Response(JSON.stringify({ success: true, order_number: order.order_number, mailed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
