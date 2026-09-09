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
import { vatFromGross } from '../../../lib/commerce';
import { BUSINESS } from '../../../lib/business';
import { reserveInventory, releaseInventory } from '../../../lib/inventory';
import { begrens, clientSleutel, teVeelVerzoeken } from '../../../lib/rate-limit-db';
import { maakOrderToken, authSecretOntbreekt } from '../../../lib/order-token';
import { logGebeurtenis } from '../../../lib/order-events';
import { claimBon } from '../../../lib/tegoedbon';
import { checkBotId } from 'botid/server';

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

  /**
   * BotID, vóór er voorraad gereserveerd wordt en vóór er een betaling bij
   * Mollie ontstaat.
   *
   * Deze route stuurt JSON en heeft dus geen formuliercontrole zoals de andere
   * publieke adressen. Hij staat er wel bij, want hij heeft dezelfde vorm: een
   * publiek adres dat onze eigen pagina aanroept. De bot van september is in
   * zes dagen vier keer verhuisd naar de deur die nog openstond, en dit is de
   * enige die daarna nog over was.
   *
   * Let op bij het beoordelen van een storing: gaat er hier iets mis met de
   * BotID-controle, dan kan niemand meer afrekenen. Dat is het duurste geval
   * in deze codebase, en de reden dat deze route in de PR apart is nagemeten.
   */
  if ((await checkBotId()).isBot) {
    console.warn('[checkout] BotID: verzoek geweigerd.');
    return new Response(JSON.stringify({
      error: 'We konden dit verzoek niet verwerken. Probeer het opnieuw vanaf de site.',
    }), { status: 403 });
  }

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
  /**
   * Prijzen zijn consumentenprijzen inclusief btw, dus het totaal is gewoon
   * artikelen plus verzending. De btw telt er niet bovenop, hij zit er al in.
   *
   * `tax_cents` bewaart wél het bedrag dat erin zit, en stond eerder op nul.
   * Klantgericht viel dat niet op, want de bevestigingsmail rekent zelf terug.
   * Voor een boekhoudexport is een kolom die nul zegt terwijl er 21% in zit
   * een valstrik voor wie hem ooit uitleest.
   */
  const total = subtotal + shipping;
  const tax = vatFromGross(total, BUSINESS.vatRate);

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

  /**
   * Upsert customer.
   *
   * `accepts_marketing` gaat hier alleen omhóóg. Het stond eerst als
   * `body.customer.accepts_marketing || false` in de upsert, en dat zette een
   * eerdere toestemming stil terug op false zodra dezelfde klant een tweede keer
   * bestelde zonder het vakje aan te vinken. Een leeg vakje is geen intrekking,
   * het is de afwezigheid van een nieuwe verklaring; intrekken doe je met de
   * uitschrijflink. Zie ook de les "wie bezit de tabel": een upsert vanaf de ene
   * kant wist zonder melding wat aan de andere kant is vastgelegd.
   */
  const klantRij: Record<string, unknown> = {
    email: body.customer.email,
    first_name: body.customer.first_name,
    last_name: body.customer.last_name,
  };
  if (body.customer.accepts_marketing) klantRij.accepts_marketing = true;

  const { data: cust } = await sb.from('customers')
    .upsert(klantRij, { onConflict: 'email' }).select().single();

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

  /**
   * De tegoedbon, ná het aanmaken van de bestelling.
   *
   * De claim heeft een bestelling nodig om aan te hangen, want dat is wat hem
   * atomair maakt: de code kan maar aan één order tegelijk vastzitten. Gaat de
   * betaling niet door, dan geeft de webhook hem weer vrij, net zoals hij de
   * gereserveerde voorraad vrijgeeft.
   *
   * De korting gaat van het subtotaal af en nooit van de verzending, want dat
   * staat zo in de actievoorwaarden. Het te betalen bedrag blijft minstens één
   * cent: een betaling van nul euro bestaat bij Mollie niet, en die grens is
   * met een bon van 75 euro en verzending vanaf 8,95 nu niet te raken. De
   * clamp staat er voor de volgende bon, die groter kan zijn.
   */

  if (orderErr || !order) {
    await rollback();
    return new Response(JSON.stringify({ error: 'Kon bestelling niet aanmaken.' }), { status: 500 });
  }

  let korting = 0;
  let bonCode: string | null = null;

  if (body.tegoedbon?.trim()) {
    const uitslag = await claimBon(sb, body.tegoedbon, order.id, subtotal);
    if (uitslag.ok) {
      // Minstens één cent te betalen houden. Zie de toelichting hierboven.
      korting = Math.min(uitslag.korting, total - 1);
      bonCode = uitslag.bon.code;
    } else {
      /**
       * Werkt de code niet, dan stopt het afrekenen hier.
       *
       * De verleiding is om door te gaan zonder korting en er een melding bij
       * te zetten, maar dan staat de bezoeker bij Mollie met een bedrag dat
       * hoger is dan waar hij op rekende, en op dat scherm is niets meer uit te
       * leggen. Wie een bon invoert, verwacht korting of een reden waarom niet.
       */
      await rollback();
      await sb.from('orders').update({ status: 'cancelled', payment_status: 'failed' }).eq('id', order.id);
      return new Response(JSON.stringify({
        error: uitslag.melding,
        veld: 'tegoedbon',
      }), { status: 400 });
    }
  }

  const teBetalen = total - korting;
  if (korting > 0) {
    await sb.from('orders').update({
      korting_cents: korting,
      tegoedbon_code: bonCode,
      total_cents: teBetalen,
      // De btw zit in het bedrag dat werkelijk betaald wordt, niet in het
      // bedrag van vóór de korting. Zonder deze herberekening klopt de
      // boekhoudexport niet meer zodra er één bon gebruikt is.
      tax_cents: vatFromGross(teBetalen, BUSINESS.vatRate),
    }).eq('id', order.id);
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
    toelichting: `${lineItems.length} regel(s), ${(teBetalen / 100).toFixed(2)} EUR`
      + (korting ? ` (tegoedbon ${bonCode}, ${(korting / 100).toFixed(2)} EUR korting)` : ''),
  });

  // 5. Mollie payment; bij falen niets gereserveerd of open laten hangen
  const siteUrl = import.meta.env.PUBLIC_SITE_URL || new URL(request.url).origin;
  let payment: Payment | undefined;
  try {
    const mollie = getMollie();
    payment = await mollie.payments.create({
      amount: { currency: 'EUR', value: (teBetalen / 100).toFixed(2) },
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
    /**
     * Wat er werkelijk af ging, uit de database gerekend en niet uit wat de
     * browser dacht. Een code die niet werkt komt hier nooit langs: die geeft
     * hierboven een 400 met de reden.
     */
    korting_cents: korting,
    tegoedbon: bonCode,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
