/**
 * POST /api/checkout/webhook
 *
 * Mollie-callback bij elke statuswijziging van een betaling. Body is
 * form-encoded { id: 'tr_xxx' }; de status halen we altijd zelf bij Mollie
 * op, want de body is niet ondertekend.
 *
 * Idempotent op drie niveaus, want Mollie mag deze webhook meermaals
 * aanroepen:
 *  1. `mapMollieStatus` laat een order die al 'paid' is met rust, dus geen
 *     tweede voorraadaftrek;
 *  2. de ordertijdlijn heeft een unieke index per (order, soort);
 *  3. de mail-outbox dedupliceert op sleutel.
 *
 * Mail gaat via de outbox, niet rechtstreeks. Eerder vertrok de
 * orderbevestiging hier met een `.catch()`: haperde Resend, dan was die mail
 * weg en probeerde Mollie het niet opnieuw, want de webhook had al 200
 * teruggegeven.
 */

import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getMollie } from '../../../lib/mollie';
import { mapMollieStatus } from '../../../lib/checkout-logic';
import { finalizeInventory, releaseInventory } from '../../../lib/inventory';
import {
  renderOrderConfirmation,
  renderNieuweBestelling,
  renderTerugbetaling,
} from '../../../lib/mail';
import { zetInWachtrij } from '../../../lib/outbox';
import { logGebeurtenis } from '../../../lib/order-events';
import { maakOrderToken } from '../../../lib/order-token';
import { getSiteOrigin } from '../../../lib/site';
import { BUSINESS } from '../../../lib/business';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const sb = getSupabaseAdmin();
  if (!sb) return new Response('', { status: 503 });

  const params = new URLSearchParams(await request.text());
  const paymentId = params.get('id');
  if (!paymentId) return new Response('', { status: 400 });

  let payment;
  try {
    payment = await getMollie().payments.get(paymentId);
  } catch (err) {
    console.error('[webhook] Mollie payment ophalen faalde:', err);
    // 503 zodat Mollie het later opnieuw probeert
    return new Response('', { status: 503 });
  }

  /**
   * De twee beeldjoins voeden de thumbnail in de orderbevestiging. De variant
   * gaat voor: bij de hoodies verschilt de foto per kleur, en `products` voert
   * alleen het hoofdbeeld. Faalt de join of staat er niets, dan rendert de
   * regel zonder foto (zie `mailBeeld` in lib/mail.ts).
   */
  const { data: order } = await sb
    .from('orders')
    .select('*, order_items(*, product_variants(image_url), products(image_url))')
    .eq('mollie_payment_id', paymentId)
    .single();

  if (!order) return new Response('', { status: 404 });

  const origin = getSiteOrigin();

  /* ---------- Terugbetalingen ---------- */
  // Mollie meldt een refund via dezelfde webhook. Dit staat vóór de gewone
  // statusafhandeling: een terugbetaalde order is niet "opnieuw betaald".
  const terugbetaaldCents = Math.round(Number(payment.amountRefunded?.value ?? 0) * 100);
  if (terugbetaaldCents > (order.refunded_cents || 0)) {
    const volledig = terugbetaaldCents >= order.total_cents;
    await sb.from('orders').update({
      refunded_cents: terugbetaaldCents,
      refunded_at: new Date().toISOString(),
      ...(volledig ? { status: 'refunded', payment_status: 'refunded' } : {}),
    }).eq('id', order.id);

    await logGebeurtenis(sb, order.id, 'terugbetaald', {
      bron: 'mollie',
      toelichting: volledig ? 'Volledig terugbetaald' : 'Gedeeltelijk terugbetaald',
      meta: { bedrag_cents: terugbetaaldCents },
    });

    const mail = renderTerugbetaling(order.order_number, order.customer_name, terugbetaaldCents, volledig);
    await zetInWachtrij({
      soort: 'terugbetaling',
      ontvanger: order.customer_email,
      onderwerp: mail.subject,
      html: mail.html,
      dedupeSleutel: `terugbetaling:${order.id}:${terugbetaaldCents}`,
    });

    return new Response('', { status: 200 });
  }

  /* ---------- Gewone statusovergang ---------- */
  const transition = mapMollieStatus(payment.status, {
    payment_status: order.payment_status,
    status: order.status,
  });

  const noChange =
    transition.action === 'none' &&
    transition.payment_status === order.payment_status &&
    transition.status === order.status;
  if (noChange) return new Response('', { status: 200 });

  if (transition.action === 'finalize') {
    // Reservering wordt verkoop: quantity en reserved beide omlaag
    for (const item of order.order_items || []) {
      const ok = await finalizeInventory(sb, item.variant_id, item.quantity);
      if (!ok) console.error('[webhook] finalize_inventory faalde voor variant', item.variant_id);
    }
  } else if (transition.action === 'release') {
    for (const item of order.order_items || []) {
      const ok = await releaseInventory(sb, item.variant_id, item.quantity);
      if (!ok) console.error('[webhook] release_inventory faalde voor variant', item.variant_id);
    }
  }

  await sb.from('orders').update({
    payment_status: transition.payment_status,
    status: transition.status,
    paid_at: transition.markPaidAt ? new Date().toISOString() : order.paid_at,
  }).eq('id', order.id);

  if (transition.status === 'cancelled') {
    await logGebeurtenis(sb, order.id, 'geannuleerd', {
      bron: 'mollie',
      toelichting: `Betaling ${payment.status}`,
    });
  }

  if (transition.markPaidAt) {
    await logGebeurtenis(sb, order.id, 'betaald', { bron: 'mollie' });

    const portaalUrl = `${origin}/bestelling/${maakOrderToken(order.id, 'portaal')}`;

    /**
     * De beeldpaden uit de joins plat op de regel zetten, zodat het sjabloon
     * niets van de databasevorm hoeft te weten. De variantfoto gaat voor de
     * productfoto: bij de hoodies verschilt het beeld per kleur.
     */
    const regelsMetBeeld = (order.order_items || []).map((regel: any) => ({
      ...regel,
      image_url: regel.product_variants?.image_url || regel.products?.image_url || null,
    }));

    // Bevestiging aan de klant
    const bevestiging = renderOrderConfirmation({ ...order, order_items: regelsMetBeeld, portaalUrl });
    await zetInWachtrij({
      soort: 'orderbevestiging',
      ontvanger: order.customer_email,
      onderwerp: bevestiging.subject,
      html: bevestiging.html,
      dedupeSleutel: `orderbevestiging:${order.id}`,
    });

    // Melding aan de winkelier: zonder dit merk je een bestelling pas als je
    // zelf gaat kijken.
    const melding = renderNieuweBestelling(order, `${origin}/beheer/order/${order.id}`);
    await zetInWachtrij({
      soort: 'winkelier-nieuwe-order',
      ontvanger: BUSINESS.orderEmail,
      onderwerp: melding.subject,
      html: melding.html,
      replyTo: order.customer_email,
      dedupeSleutel: `winkelier:${order.id}`,
    });
  }

  // Mollie verwacht 200 OK
  return new Response('', { status: 200 });
};
