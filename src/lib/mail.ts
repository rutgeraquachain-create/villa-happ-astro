/**
 * Villa Happ — Transactionele e-mail via Resend (server-only)
 *
 * Env-gated: zonder RESEND_API_KEY doet dit bewust niets (lokaal en
 * op previews wil je geen echte mail). Geen SDK-dependency nodig,
 * de Resend REST-API is één fetch.
 */

import { formatPrice } from './commerce';
import { BUSINESS, isPending } from './business';
import { RETURN_FEE_SENTENCE, RETURN_SHIPPING_REFUND_SENTENCE } from './legal';
import { getSiteOrigin } from './site';

/**
 * Btw-bedrag dat in een brutobedrag zit. Prijzen op de site zijn
 * consumentenprijzen inclusief btw, dus rekenen we terug in plaats van
 * erbij op te tellen.
 */
export function vatFromGross(grossCents: number, rate = BUSINESS.vatRate): number {
  return Math.round((grossCents * rate) / (100 + rate));
}

const RESEND_API_KEY = import.meta.env.RESEND_API_KEY;
/**
 * Afzender. De standaardwaarde leest `BUSINESS.orderEmail` in plaats van een
 * eigen letterlijk adres: stond hier eerder een tweede kopie van het adres,
 * en bij de domeinverhuizing is precies zo'n kopie het adres dat achterblijft.
 *
 * In Vercel staat `MAIL_FROM` expliciet; die wint. Let op dat Astro deze
 * waarde bij de build in de servercode bakt, dus een wijziging vraagt een
 * redeploy, niet alleen een opgeslagen variabele.
 */
const MAIL_FROM = import.meta.env.MAIL_FROM || `Villa Happ <${BUSINESS.orderEmail}>`;

interface OrderForMail {
  order_number: string;
  /** Link naar het klantportaal, met capability-token. Optioneel: zonder
   *  token (bijvoorbeeld in een test) vervalt simpelweg de knop. */
  portaalUrl?: string;
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
  const vatIncluded = vatFromGross(order.total_cents);
  const origin = getSiteOrigin();
  const volgKnop = order.portaalUrl
    ? `<p style="margin:0 0 26px;"><a href="${order.portaalUrl}" style="display:inline-block;background:#2B2620;color:#F7F3EC;padding:14px 26px;text-decoration:none;">Volg je bestelling</a></p>`
    : '';

  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#F7F3EC;padding:32px;color:#2B2620;">
    <p style="font-style:italic;font-size:22px;margin:0 0 4px;">Villa Happ</p>
    <h1 style="font-size:26px;margin:0 0 16px;">Bedankt voor je bestelling, ${escapeHtml(firstName)}.</h1>
    <p style="margin:0 0 24px;line-height:1.6;">We hebben je betaling ontvangen. Bestelling <b>${escapeHtml(order.order_number)}</b> wordt met zorg ingepakt en via PostNL verzonden. Je ontvangt een track &amp; trace zodra het pakket onderweg is.</p>
    ${volgKnop}
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${items}
      <tr><td style="padding:8px 0;">Subtotaal</td><td style="padding:8px 0;text-align:right;">${formatPrice(order.subtotal_cents)}</td></tr>
      <tr><td style="padding:8px 0;">Verzending</td><td style="padding:8px 0;text-align:right;">${order.shipping_cents === 0 ? 'Gratis' : formatPrice(order.shipping_cents)}</td></tr>
      <tr><td style="padding:8px 0;font-weight:bold;border-top:2px solid #2B2620;">Totaal</td><td style="padding:8px 0;text-align:right;font-weight:bold;border-top:2px solid #2B2620;">${formatPrice(order.total_cents)}</td></tr>
      <tr><td colspan="2" style="padding:6px 0;font-size:12px;color:#8A8072;">Inclusief ${BUSINESS.vatRate}% btw (${formatPrice(vatIncluded)})</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:14px;line-height:1.6;"><b>Bezorgadres</b><br>${address}</p>

    <div style="margin:28px 0 0;padding:16px 18px;background:#EFE8DC;font-size:13px;line-height:1.65;">
      <b style="font-size:14px;">Je herroepingsrecht</b><br>
      Je mag deze bestelling ${BUSINESS.returnDays} dagen bekijken en zonder opgaaf van reden
      terugsturen, gerekend vanaf de dag dat je het laatste stuk ontvangt. Meld je herroeping
      per e-mail of met het modelformulier, en stuur daarna binnen 14 dagen terug.
      De verzendkosten van de retourzending zijn voor eigen rekening.<br>
      ${RETURN_FEE_SENTENCE}<br>
      ${RETURN_SHIPPING_REFUND_SENTENCE}<br>
      <a href="${origin}/herroeping" style="color:#2B2620;">Modelformulier voor herroeping</a> ·
      <a href="${origin}/algemene-voorwaarden" style="color:#2B2620;">Algemene voorwaarden</a> ·
      <a href="${origin}/retourneren" style="color:#2B2620;">Zo retourneer je</a>
    </div>

    <p style="margin:24px 0 0;font-size:12px;color:#8A8072;line-height:1.6;">
      Vragen over je bestelling? Antwoord gewoon op deze mail.<br>
      ${escapeHtml(BUSINESS.legalName)} · KvK ${BUSINESS.kvk}${isPending(BUSINESS.vatId) ? '' : ` · Btw ${escapeHtml(BUSINESS.vatId)}`}
    </p>
  </div>`;

  return { subject: `Je Villa Happ bestelling ${order.order_number} is bevestigd`, html };
}

export async function sendOrderConfirmation(order: OrderForMail): Promise<boolean> {
  if (!isMailConfigured()) {
    console.info('[mail] RESEND_API_KEY niet gezet; orderbevestiging overgeslagen voor', order.order_number);
    return false;
  }
  const { subject, html } = renderOrderConfirmation(order);
  return verstuurDirect(order.customer_email, subject, html);
}

/**
 * Verstuurt één mail rechtstreeks via Resend.
 *
 * Roep dit niet aan vanuit een route: gebruik de outbox (src/lib/outbox.ts).
 * Die legt de mail eerst vast en probeert hem dan pas te versturen, zodat een
 * hapering bij Resend geen orderbevestiging meer laat verdampen. Deze functie
 * is de laatste stap van de outbox zelf.
 */
export async function verstuurDirect(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [to],
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
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
  return verstuurDirect(to, subject, html);
}

/* ---------- Verzendbevestiging ---------- */

export interface ShipmentForMail {
  order_number: string;
  portaalUrl?: string;
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
    <p style="margin:0;font-size:13px;color:#8A8072;line-height:1.6;">
      Vragen over je bestelling? Antwoord op deze mail.
      Je hebt ${BUSINESS.returnDays} dagen bedenktijd vanaf ontvangst en betaalt de retourzending zelf. ${RETURN_FEE_SENTENCE}
      <a href="${getSiteOrigin()}/retourneren" style="color:#8A8072;">Zo werkt retourneren.</a>
    </p>
  </div>`;
  return { subject: `Je Villa Happ bestelling ${order.order_number} is onderweg`, html };
}

export async function sendShippingConfirmation(order: ShipmentForMail): Promise<boolean> {
  if (!isMailConfigured()) {
    console.info('[mail] RESEND_API_KEY niet gezet; verzendbevestiging overgeslagen voor', order.order_number);
    return false;
  }
  const { subject, html } = renderShippingConfirmation(order);
  return verstuurDirect(order.customer_email, subject, html);
}

/* ---------- Contactformulier ---------- */

export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export function renderContactMessage(m: ContactMessage): { subject: string; html: string } {
  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;color:#2B2620;">
    <h1 style="font-size:18px;margin:0 0 4px;">Bericht via het contactformulier</h1>
    <p style="margin:0 0 20px;color:#8A8072;font-size:13px;">Onderwerp: ${escapeHtml(m.subject)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#8A8072;width:90px;">Naam</td><td style="padding:6px 0;">${escapeHtml(m.name)}</td></tr>
      <tr><td style="padding:6px 0;color:#8A8072;">E-mail</td><td style="padding:6px 0;"><a href="mailto:${encodeURIComponent(m.email)}">${escapeHtml(m.email)}</a></td></tr>
    </table>
    <div style="margin:20px 0;padding:16px;background:#F7F3EC;border-left:2px solid #2B2620;white-space:pre-wrap;font-size:14px;line-height:1.6;">${escapeHtml(m.message)}</div>
    <p style="margin:0;font-size:12px;color:#8A8072;">Antwoorden gaat rechtstreeks naar de afzender.</p>
  </div>`;
  return { subject: `[${m.subject}] Bericht van ${m.name}`, html };
}

/**
 * Stuurt het contactbericht naar de eigen mailbox, met de afzender als
 * reply-to zodat "beantwoorden" direct bij de klant uitkomt.
 * Geeft false zonder mailkanaal: de pagina moet dan géén bevestiging
 * tonen, want er is niets verstuurd.
 */
export async function sendContactMessage(m: ContactMessage, to: string): Promise<boolean> {
  if (!isMailConfigured()) {
    console.info('[mail] RESEND_API_KEY niet gezet; contactbericht niet verstuurd van', m.email);
    return false;
  }
  const { subject, html } = renderContactMessage(m);
  return verstuurDirect(to, subject, html, m.email);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- Melding aan de winkelier ---------- */

/**
 * Zonder deze mail merk je een bestelling pas als je zelf in het dashboard
 * kijkt. Bij een drop van vijfhonderd stuks is dat onwerkbaar, en bij een
 * enkele bestelling per week net zo goed: dan blijft er een pakket liggen.
 */
export function renderNieuweBestelling(order: OrderForMail, beheerUrl: string): { subject: string; html: string } {
  const regels = (order.order_items || [])
    .map((i) => `<li>${i.quantity}× ${escapeHtml(i.product_name)}${i.variant_label ? ` (${escapeHtml(i.variant_label)})` : ''}</li>`)
    .join('');
  const a = order.shipping_address || {};
  const adres = [
    [a.street, a.house_number].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter(Boolean).join(', ');

  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#2B2620;">
    <h1 style="font-size:19px;margin:0 0 4px;">Nieuwe bestelling ${escapeHtml(order.order_number)}</h1>
    <p style="margin:0 0 18px;color:#8A8072;font-size:13px;">${formatPrice(order.total_cents)} · ${escapeHtml(order.customer_name || '')} · ${escapeHtml(order.customer_email)}</p>
    <ul style="margin:0 0 18px;padding-left:20px;font-size:14px;line-height:1.7;">${regels}</ul>
    <p style="margin:0 0 22px;font-size:14px;"><b>Bezorgadres</b><br>${escapeHtml(adres)}</p>
    <p style="margin:0 0 24px;">
      <a href="${beheerUrl}" style="display:inline-block;background:#2B2620;color:#F7F3EC;padding:12px 22px;text-decoration:none;font-size:14px;">Open in beheer</a>
    </p>
    <p style="margin:0;font-size:12px;color:#8A8072;">Zet de bestelling op verzonden zodra het pakket weg is, dan krijgt de klant automatisch de track en trace.</p>
  </div>`;
  return { subject: `Nieuwe bestelling ${order.order_number} · ${formatPrice(order.total_cents)}`, html };
}

/* ---------- Terugbetaling ---------- */

export function renderTerugbetaling(
  orderNumber: string,
  customerName: string | undefined,
  bedragCents: number,
  volledig: boolean,
): { subject: string; html: string } {
  const firstName = (customerName || '').split(' ')[0] || 'daar';
  const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#F7F3EC;padding:32px;color:#2B2620;">
    <p style="font-style:italic;font-size:22px;margin:0 0 4px;">Villa Happ</p>
    <h1 style="font-size:26px;margin:0 0 16px;">Je geld is onderweg terug, ${escapeHtml(firstName)}.</h1>
    <p style="margin:0 0 24px;line-height:1.6;">
      We hebben ${volledig ? 'het volledige bedrag' : 'een deel'} van bestelling
      <b>${escapeHtml(orderNumber)}</b> terugbetaald: <b>${formatPrice(bedragCents)}</b>.
      Het bedrag komt terug op de rekening waarmee je betaalde. Je bank heeft daar
      doorgaans een paar werkdagen voor nodig.
    </p>
    <p style="margin:0;font-size:13px;color:#8A8072;line-height:1.6;">Klopt er iets niet? Antwoord op deze mail, dan zoeken we het uit.</p>
  </div>`;
  return { subject: `Terugbetaling voor bestelling ${orderNumber}`, html };
}
