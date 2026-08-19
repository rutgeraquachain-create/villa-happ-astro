/**
 * POST /api/checkout/create
 *
 * Body: { items: [{ variant_id, quantity }], customer: {...}, shipping: {...} }
 *
 * Flow:
 * 1. Validate cart items + voorraad
 * 2. Calculate totals server-side (klant kan prijzen niet manipuleren)
 * 3. Reserve inventory (atomair; bij tekort alles terugdraaien)
 * 4. Create order in Supabase (status=pending, payment_status=open)
 * 5. Create Mollie payment (bij falen: reserveringen vrijgeven + order annuleren)
 * 6. Return Mollie checkout URL
 */

import type { APIRoute } from 'astro';
import { Locale } from '@mollie/api-client';
import type { Payment } from '@mollie/api-client';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getMollie } from '../../../lib/mollie';
import { CheckoutSchema, shippingCost } from '../../../lib/checkout-logic';
import { reserveInventory, releaseInventory } from '../../../lib/inventory';
import { begrens, clientSleutel, teVeelVerzoeken } from '../../../lib/rate-limit-db';
import { maakOrderToken, authSecretOntbreekt } from '../../../lib/order-token';
import { logGebeurtenis } from '../../../lib/order-events';

export const prerender = false;

/**
 * Taal van het Mollie-betaalscherm, afgeleid uit het verzendland.
 *
 * Stond eerder vast op `nl_NL` terwijl de winkel naar België en Duitsland
 * verstuurt. Een Duitse klant kreeg dus een Nederlands scherm op het moment
 * dat hij zijn geld overmaakt. De beschikbare betaalmethoden veranderen hier
 * niet door; die komen van het Mollie-profiel.
 *
 * België krijgt `nl_BE` en niet `fr_BE`: de winkel is verder volledig
 * Nederlandstalig, dus een Frans betaalscherm zou het enige Franse scherm in
 * de hele bestelling zijn. Komt er ooit een Franse versie van de site, dan
 * is dit de plek waar die keuze bij hoort.
 */
const LOCALE_PER_LAND = {
  NL: Locale.nl_NL,
  BE: Locale.nl_BE,
  DE: Locale.de_DE,
} as const;

export const POST: APIRoute = async ({ request }) => {
  const limiet = await begrens('checkout', clientSleutel(request), 10);
  if (!limiet.toegestaan) return teVeelVerzoeken(limiet);

  const sb = getSupabaseAdmin();
  if (!sb) {
    return new Response(JSON.stringify({ error: 'Supabase niet geconfigureerd' }), { status: 503 });
  }

  // Vroeg stoppen, vóór er voorraad gereserveerd is. De redirect naar de
  // bedanktpagina draagt een ondertekend token, dus zonder AUTH_SECRET kan
  // deze bestelling nooit afgerond worden. Zonder deze check klapte hij pas
  // bij het aanmaken van de Mollie-betaling, met een melding die naar Mollie
  // wees terwijl daar niets mis was.
  if (authSecretOntbreekt()) {
    console.error('[checkout] AUTH_SECRET ontbreekt of is korter dan 32 tekens; afrekenen is uitgeschakeld.');
    return new Response(JSON.stringify({
      error: 'Afrekenen is tijdelijk niet beschikbaar. Probeer het later opnieuw.',
    }), { status: 503 });
  }

  let body;
  try {
    body = CheckoutSchema.parse(await request.json());
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Invalid request', details: err?.issues }), { status: 400 });
  }

  // 1. Haal variants + voorraad op
  const variantIds = body.items.map(i => i.variant_id);
  const { data: variants, error: vErr } = await sb
    .from('product_variants')
    .select('id, product_id, sku, size, color, price_cents, products(id, name, price_cents, status)')
    .in('id', variantIds);

  if (vErr || !variants || variants.length !== variantIds.length) {
    return new Response(JSON.stringify({ error: 'Een of meer producten zijn niet meer beschikbaar.' }), { status: 400 });
  }

  // 2. Bouw line items (voorraadcheck gebeurt atomair bij het reserveren)
  let subtotal = 0;
  const lineItems = [];
  for (const reqItem of body.items) {
    const variant = variants.find((v: any) => v.id === reqItem.variant_id);
    if (!variant || (variant.products as any)?.status !== 'published') {
      return new Response(JSON.stringify({ error: 'Product niet beschikbaar.' }), { status: 400 });
    }
    const unitPrice = variant.price_cents || (variant.products as any).price_cents;
    const lineTotal = unitPrice * reqItem.quantity;
    subtotal += lineTotal;
    lineItems.push({
      variant_id: variant.id,
      product_id: variant.product_id,
      product_name: (variant.products as any).name,
      variant_label: [variant.color, variant.size].filter(Boolean).join(' / '),
      sku: variant.sku,
      unit_price_cents: unitPrice,
      quantity: reqItem.quantity,
      total_cents: lineTotal,
    });
  }

  const shipping = shippingCost(body.shipping.country, subtotal);
  const tax = 0; // BTW is al verwerkt in prijs (Dutch BTW-inclusief gebruikelijk)
  const total = subtotal + shipping + tax;

  // 3. Reserveer voorraad atomair; bij tekort alle eerdere reserveringen terugdraaien
  const reserved: { variant_id: string; quantity: number; product_name: string }[] = [];
  const rollback = async () => {
    for (const r of reserved) {
      await releaseInventory(sb, r.variant_id, r.quantity);
    }
  };

  for (const item of lineItems) {
    const ok = await reserveInventory(sb, item.variant_id, item.quantity);
    if (!ok) {
      await rollback();
      return new Response(JSON.stringify({
        error: `Onvoldoende voorraad voor ${item.product_name}.`,
        variant_id: item.variant_id,
      }), { status: 409 });
    }
    reserved.push({ variant_id: item.variant_id, quantity: item.quantity, product_name: item.product_name });
  }

  // 4. Create order
  // Geen zelfverzonnen terugval hier. Die maakte van een tijdstempel een
  // bestelnummer (VH-2026-84713), en de teller telt vanaf het hoogste
  // uitgegeven nummer: één misser vergiftigt daarmee de hele reeks.
  // Liever eerlijk falen; de klant kan opnieuw proberen en houdt zijn geld.
  const { data: orderNumberData, error: onErr } = await sb.rpc('generate_order_number');
  const orderNumber = typeof orderNumberData === 'string' ? orderNumberData : null;
  if (onErr || !orderNumber) {
    console.error('[checkout] generate_order_number faalde:', onErr);
    await rollback();
    return new Response(JSON.stringify({ error: 'Bestellen lukt nu even niet. Probeer het zo opnieuw.' }), { status: 503 });
  }

  // Upsert customer
  const { data: cust } = await sb.from('customers').upsert({
    email: body.customer.email,
    first_name: body.customer.first_name,
    last_name: body.customer.last_name,
    accepts_marketing: body.customer.accepts_marketing || false,
  }, { onConflict: 'email' }).select().single();

  const { data: order, error: orderErr } = await sb.from('orders').insert({
    order_number: orderNumber,
    customer_id: cust?.id,
    customer_email: body.customer.email,
    customer_name: `${body.customer.first_name} ${body.customer.last_name}`,
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    tax_cents: tax,
    total_cents: total,
    shipping_address: body.shipping,
    billing_address: body.shipping,
  }).select().single();

  if (orderErr || !order) {
    await rollback();
    return new Response(JSON.stringify({ error: 'Kon bestelling niet aanmaken.' }), { status: 500 });
  }

  const { error: itemsErr } = await sb.from('order_items').insert(
    lineItems.map(li => ({ ...li, order_id: order.id }))
  );
  if (itemsErr) {
    await rollback();
    await sb.from('orders').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', order.id);
    return new Response(JSON.stringify({ error: 'Kon bestelling niet aanmaken.' }), { status: 500 });
  }

  await logGebeurtenis(sb, order.id, 'aangemaakt', {
    toelichting: `${lineItems.length} regel(s), ${(total / 100).toFixed(2)} EUR`,
  });

  // 5. Mollie payment; bij falen niets gereserveerd of open laten hangen
  const siteUrl = import.meta.env.PUBLIC_SITE_URL || new URL(request.url).origin;
  let payment: Payment | undefined;
  try {
    const mollie = getMollie();
    payment = await mollie.payments.create({
      amount: { currency: 'EUR', value: (total / 100).toFixed(2) },
      description: `Villa Happ ${orderNumber}`,
      redirectUrl: `${siteUrl}/checkout/success?t=${maakOrderToken(order.id, 'status')}`,
      cancelUrl: `${siteUrl}/checkout/cancelled?order=${order.order_number}`,
      webhookUrl: `${siteUrl}/api/checkout/webhook`,
      metadata: { order_id: order.id, order_number: order.order_number },
      locale: LOCALE_PER_LAND[body.shipping.country] ?? Locale.nl_NL,
    });
  } catch (err) {
    console.error('[checkout] Mollie payment create faalde:', err);
    await rollback();
    await sb.from('orders').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', order.id);
    return new Response(JSON.stringify({ error: 'Betaling kon niet worden gestart. Probeer het opnieuw.' }), { status: 502 });
  }
  if (!payment) {
    await rollback();
    return new Response(JSON.stringify({ error: 'Betaling kon niet worden gestart. Probeer het opnieuw.' }), { status: 502 });
  }

  // 6. Save Mollie id op order
  await sb.from('orders').update({
    mollie_payment_id: payment.id,
  }).eq('id', order.id);

  return new Response(JSON.stringify({
    success: true,
    order_number: order.order_number,
    checkout_url: payment.getCheckoutUrl(),
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
