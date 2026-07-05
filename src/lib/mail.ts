/**
 * Villa Happ — Transactionele e-mail via Resend (server-only)
 *
 * Env-gated: zonder RESEND_API_KEY doet dit bewust niets (lokaal en
 * op previews wil je geen echte mail). Geen SDK-dependency nodig,
 * de Resend REST-API is één fetch.
 */

import { formatPrice } from './commerce';

const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
const MAIL_FROM = import.meta.env.MAIL_FROM || 'Villa Happ <bestellingen@villa-happ.nl>';

interface OrderForMail {
  order_number: string;
  customer_email: string;
  customer_name?: string;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  shipping_address?: {
    street?: string; house_number?: string; postal_code?: string; city?: string; country?: string;
  };
  order_items?: {
    product_name: string; variant_label?: string; quantity: number; total_cents: number;
  }[];
}

export function isMailConfigured(): boolean {
  return typeof RESEND_API_KEY === 'string' && RESEND_API_KEY.startsWith('re_');
}

export function renderOrderConfirmation(order: OrderForMail): { subject: string; html: string } {
  const items = (order.order_items || [])
    .map((i) =>
      `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #E8E1D5;">${i.quantity}× ${escapeHtml(i.product_name)}${i.variant_label ? ` <span style="color:#8A8072;">(${escapeHtml(i.variant_label)})</span>` : ''}</td>
        <td style="padding:8px 0;border-bottom:1px solid #E8E1D5;text-align:right;">${formatPrice(i.total_cents)}</td>
      </tr>`)
    .join('');

  const a = order.shipping_address || {};
  const address = [
    [a.street, a.house_number].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter(Boolean).join('<br>');

  const firstName = (order.customer_name || '').split(' ')[0] || 'daar';

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#F7F3EC;padding:32px;color:#2B2620;">
    <p style="font-style:italic;font-size:22px;margin:0 0 4px;">Villa Happ</p>
    <h1 style="font-size:26px;margin:0 0 16px;">Bedankt voor je bestelling, ${escapeHtml(firstName)}.</h1>
    <p style="margin:0 0 24px;line-height:1.6;">We hebben je betaling ontvangen. Bestelling <b>${escapeHtml(order.order_number)}</b> wordt met zorg ingepakt en via PostNL verzonden. Je ontvangt een track &amp; trace zodra het pakket onderweg is.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${items}
      <tr><td style="padding:8px 0;">Verzending</td><td style="padding:8px 0;text-align:right;">${order.shipping_cents === 0 ? 'Gratis' : formatPrice(order.shipping_cents)}</td></tr>
      <tr><td style="padding:8px 0;font-weight:bold;border-top:2px solid #2B2620;">Totaal</td><td style="padding:8px 0;text-align:right;font-weight:bold;border-top:2px solid #2B2620;">${formatPrice(order.total_cents)}</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:14px;line-height:1.6;"><b>Bezorgadres</b><br>${address}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#8A8072;line-height:1.6;">Vragen over je bestelling? Antwoord op deze mail. Retourneren kan kosteloos binnen 30 dagen.</p>
  </div>`;

  return { subject: `Je Villa Happ bestelling ${order.order_number} is bevestigd`, html };
}

export async function sendOrderConfirmation(order: OrderForMail): Promise<boolean> {
  if (!isMailConfigured()) {
    console.info('[mail] RESEND_API_KEY niet gezet; orderbevestiging overgeslagen voor', order.order_number);
    return false;
  }
  const { subject, html } = renderOrderConfirmation(order);
  return sendViaResend(order.customer_email, subject, html);
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error('[mail] Resend gaf status', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

/* ---------- Back-in-stock ---------- */

export function renderBackInStock(productName: string, size: string, productUrl: string): { subject: string; html: string } {
  const sizeLabel = size && size !== 'One size' ? ` in maat ${escapeHtml(size)}` : '';
  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#F7F3EC;padding:32px;color:#2B2620;">
    <p style="font-style:italic;font-size:22px;margin:0 0 4px;">Villa Happ</p>
    <h1 style="font-size:26px;margin:0 0 16px;">Hij is er weer.</h1>
    <p style="margin:0 0 24px;line-height:1.6;">Je vroeg ons je te mailen zodra <b>${escapeHtml(productName)}</b>${sizeLabel} terug op voorraad is. Dat moment is nu. Let op: het gaat om een genummerde oplage, dus op is echt op.</p>
    <p style="margin:0 0 24px;">
      <a href="${productUrl}" style="display:inline-block;background:#2B2620;color:#F7F3EC;padding:14px 26px;text-decoration:none;">Bekijk het stuk</a>
    </p>
    <p style="margin:0;font-size:13px;color:#8A8072;line-height:1.6;">Je ontvangt deze mail eenmalig omdat je een voorraadmelding aanvroeg. Was je hem al vergeten? Dan is dit je teken.</p>
  </div>`;
  return { subject: `Terug op voorraad: ${productName}${size && size !== 'One size' ? ` (maat ${size})` : ''}`, html };
}

export async function sendBackInStock(to: string, productName: string, size: string, productUrl: string): Promise<boolean> {
  if (!isMailConfigured()) {
    console.info('[mail] RESEND_API_KEY niet gezet; back-in-stock-mail overgeslagen voor', to);
    return false;
  }
  const { subject, html } = renderBackInStock(productName, size, productUrl);
  return sendViaResend(to, subject, html);
}

/* ---------- Verzendbevestiging ---------- */

export interface ShipmentForMail {
  order_number: string;
  customer_email: string;
  customer_name?: string;
  tracking_number: string;
  tracking_carrier?: string;
  shipping_address?: { postal_code?: string; country?: string };
}

export function renderShippingConfirmation(order: ShipmentForMail): { subject: string; html: string } {
  const firstName = (order.customer_name || '').split(' ')[0] || 'daar';
  const postcode = (order.shipping_address?.postal_code || '').replace(/\s+/g, '').toUpperCase();
  const country = order.shipping_address?.country || 'NL';
  const carrier = order.tracking_carrier || 'PostNL';
  // Track & trace-link alleen als we hem betrouwbaar kunnen bouwen (PostNL-formaat)
  const trackUrl = carrier === 'PostNL' && postcode
    ? `https://jouw.postnl.nl/track-and-trace/${encodeURIComponent(order.tracking_number)}-${country}-${postcode}`
    : null;

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#F7F3EC;padding:32px;color:#2B2620;">
    <p style="font-style:italic;font-size:22px;margin:0 0 4px;">Villa Happ</p>
    <h1 style="font-size:26px;margin:0 0 16px;">Je bestelling is onderweg, ${escapeHtml(firstName)}.</h1>
    <p style="margin:0 0 24px;line-height:1.6;">Bestelling <b>${escapeHtml(order.order_number)}</b> is ingepakt en overgedragen aan ${escapeHtml(carrier)}. Je volgt het pakket met code <b>${escapeHtml(order.tracking_number)}</b>.</p>
    ${trackUrl ? `<p style="margin:0 0 24px;"><a href="${trackUrl}" style="display:inline-block;background:#2B2620;color:#F7F3EC;padding:14px 26px;text-decoration:none;">Volg je pakket</a></p>` : ''}
    <p style="margin:0;font-size:13px;color:#8A8072;line-height:1.6;">Vragen over je bestelling? Antwoord op deze mail. Retourneren kan kosteloos binnen 30 dagen.</p>
  </div>`;
  return { subject: `Je Villa Happ bestelling ${order.order_number} is onderweg`, html };
}

export async function sendShippingConfirmation(order: ShipmentForMail): Promise<boolean> {
  if (!isMailConfigured()) {
    console.info('[mail] RESEND_API_KEY niet gezet; verzendbevestiging overgeslagen voor', order.order_number);
    return false;
  }
  const { subject, html } = renderShippingConfirmation(order);
  return sendViaResend(order.customer_email, subject, html);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
