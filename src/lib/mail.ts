/**
 * Villa Happ — Transactionele e-mail via Resend (server-only)
 *
 * Env-gated: zonder RESEND_API_KEY doet dit bewust niets (lokaal en
 * op previews wil je geen echte mail). Geen SDK-dependency nodig,
 * de Resend REST-API is één fetch.
 */

import { formatPrice, vatFromGross as btwUitBruto } from './commerce';
import { BUSINESS, isPending } from './business';
import { RETURN_FEE_SENTENCE, RETURN_SHIPPING_REFUND_SENTENCE } from './legal';
import { getSiteOrigin } from './site';
import { KLEUR, LETTERTYPE, MONO, shell, knop, lijn, titel, alinea } from './mail-layout';

/**
 * Vertaalt een sitebeeld naar het mailbeeld ernaast.
 *
 * De catalogus voert WebP, en Outlook toont dat niet. `scripts/mail-assets.mjs`
 * zet daarom van elke productfoto een vierkante JPG klaar in `public/img/mail/`
 * onder dezelfde bestandsnaam. Past een pad niet in dat patroon, dan geven we
 * niets terug en rendert de regel zonder beeld: liever geen foto dan een kapot
 * icoontje bij iemand die net betaald heeft.
 */
export function mailBeeld(pad: string | undefined | null): string | null {
  if (!pad) return null;
  const match = /\/img\/products\/([^/]+)\.(webp|jpe?g|png)$/i.exec(pad);
  return match ? `/img/mail/${match[1]}.jpg` : null;
}

/**
 * Btw-bedrag dat in een brutobedrag zit.
 *
 * De berekening zelf staat in commerce.ts, want de checkout gebruikt hem ook.
 * Deze wrapper blijft bestaan omdat het btw-tarief hier een standaardwaarde
 * heeft en er bestaande aanroepen zonder tarief zijn.
 */
export function vatFromGross(grossCents: number, rate = BUSINESS.vatRate): number {
  return btwUitBruto(grossCents, rate);
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
    /**
     * Pad naar de productfoto op de site, bijvoorbeeld
     * `/img/products/sokken-front.webp`. Optioneel: zonder beeld valt de
     * thumbnail weg en schuift de tekst door. De webhook haalt hem op via een
     * join op `product_variants` en `products`.
     */
    image_url?: string | null;
  }[];
}

export function isMailConfigured(): boolean {
  return typeof RESEND_API_KEY === 'string' && RESEND_API_KEY.startsWith('re_');
}

export function renderOrderConfirmation(order: OrderForMail): { subject: string; html: string } {
  const origin = getSiteOrigin();
  const firstName = (order.customer_name || '').split(' ')[0] || 'daar';
  const vatIncluded = vatFromGross(order.total_cents);

  /**
   * Eén regel per besteld stuk, met thumbnail. De foto krijgt vaste `width` en
   * `height` als attribuut en niet alleen in CSS: laadt het beeld niet, dan
   * houdt Outlook zo toch de ruimte vast en schuift de rest van de tabel niet.
   */
  const items = (order.order_items || [])
    .map((i) => {
      const beeld = mailBeeld(i.image_url);
      const thumb = beeld
        ? `<td width="76" style="width:76px;padding:0 16px 0 0;vertical-align:top;">
             <img src="${origin}${beeld}" width="60" height="60" alt=""
                  style="display:block;border:0;outline:none;text-decoration:none;" />
           </td>`
        : '';
      return `<tr>
        ${thumb}
        <td style="padding:0;vertical-align:top;font-family:${LETTERTYPE};font-size:15px;line-height:1.5;color:${KLEUR.ink};">
          ${escapeHtml(i.product_name)}
          ${i.variant_label ? `<div style="font-size:13px;color:${KLEUR.zacht};padding-top:3px;">${escapeHtml(i.variant_label)}</div>` : ''}
          <div style="font-size:13px;color:${KLEUR.zacht};padding-top:3px;">Aantal ${i.quantity}</div>
        </td>
        <td align="right" style="padding:0;vertical-align:top;font-family:${MONO};font-size:14px;color:${KLEUR.ink};white-space:nowrap;">${formatPrice(i.total_cents)}</td>
      </tr>
      <tr><td colspan="3" height="18" style="height:18px;line-height:18px;font-size:0;">&nbsp;</td></tr>`;
    })
    .join('');

  /** Bedragregel in de telling. `sterk` zet hem op de totaalregel. */
  const bedrag = (label: string, waarde: string, sterk = false) =>
    `<tr>
      <td style="padding:5px 0;font-family:${LETTERTYPE};font-size:${sterk ? '16px' : '14px'};color:${KLEUR.ink};${sterk ? 'font-weight:bold;' : ''}">${label}</td>
      <td align="right" style="padding:5px 0;font-family:${MONO};font-size:${sterk ? '16px' : '14px'};color:${KLEUR.ink};${sterk ? 'font-weight:bold;' : ''}white-space:nowrap;">${waarde}</td>
    </tr>`;

  const a = order.shipping_address || {};
  const address = [
    [a.street, a.house_number].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter((r): r is string => Boolean(r)).map(escapeHtml).join('<br />');

  const linkStijl = `color:${KLEUR.ink};text-decoration:underline;`;

  const inhoud = `
    ${titel(`Bestelling ${escapeHtml(order.order_number)}`, `Bedankt, ${escapeHtml(firstName)}.`)}
    ${alinea('We hebben je betaling ontvangen. Je bestelling wordt met zorg ingepakt en via PostNL verzonden. Zodra het pakket onderweg is krijg je van ons een track en trace.')}

    ${order.portaalUrl ? `<div style="margin:0 0 28px;">${knop(order.portaalUrl, 'Volg je bestelling')}</div>` : ''}

    ${lijn('0 0 24px')}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      ${items}
    </table>

    ${lijn('6px 0 18px')}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      ${bedrag('Subtotaal', formatPrice(order.subtotal_cents))}
      ${bedrag('Verzending', order.shipping_cents === 0 ? 'Gratis' : formatPrice(order.shipping_cents))}
      ${bedrag('Totaal', formatPrice(order.total_cents), true)}
      <tr><td colspan="2" style="padding:4px 0 0;font-family:${LETTERTYPE};font-size:12px;color:${KLEUR.zacht};">Inclusief ${BUSINESS.vatRate}% btw (${formatPrice(vatIncluded)})</td></tr>
    </table>

    ${lijn()}

    <div style="font-family:${MONO};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${KLEUR.zacht};margin:0 0 8px;">Bezorgadres</div>
    <p style="margin:0;font-family:${LETTERTYPE};font-size:15px;line-height:1.6;color:${KLEUR.ink};">${address}</p>

    ${lijn()}

    <!--
      Het herroepingsrecht staat hier voluit en niet als link. De wet vraagt
      deze informatie op een duurzame gegevensdrager (art. 6:230m BW); een
      verwijzing naar een webpagina die morgen kan wijzigen is dat niet.
      Visueel rustig gehouden, juridisch volledig.
    -->
    <div style="font-family:${MONO};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${KLEUR.zacht};margin:0 0 8px;">Je herroepingsrecht</div>
    <p style="margin:0 0 12px;font-family:${LETTERTYPE};font-size:13px;line-height:1.7;color:${KLEUR.zacht};">
      Je mag deze bestelling ${BUSINESS.returnDays} dagen bekijken en zonder opgaaf van reden
      terugsturen, gerekend vanaf de dag dat je het laatste stuk ontvangt. Meld je herroeping
      per e-mail of met het modelformulier, en stuur daarna binnen 14 dagen terug.
      De verzendkosten van de retourzending zijn voor eigen rekening.
    </p>
    <p style="margin:0 0 12px;font-family:${LETTERTYPE};font-size:13px;line-height:1.7;color:${KLEUR.zacht};">${RETURN_FEE_SENTENCE}</p>
    <p style="margin:0 0 14px;font-family:${LETTERTYPE};font-size:13px;line-height:1.7;color:${KLEUR.zacht};">${RETURN_SHIPPING_REFUND_SENTENCE}</p>
    <p style="margin:0;font-family:${LETTERTYPE};font-size:13px;line-height:1.7;color:${KLEUR.ink};">
      <a href="${origin}/herroeping" style="${linkStijl}">Modelformulier voor herroeping</a> &middot;
      <a href="${origin}/algemene-voorwaarden" style="${linkStijl}">Algemene voorwaarden</a> &middot;
      <a href="${origin}/retourneren" style="${linkStijl}">Zo retourneer je</a>
    </p>`;

  const voet = `Vragen over je bestelling? Antwoord gewoon op deze mail.<br />
    ${escapeHtml(BUSINESS.legalName)} &middot; ${escapeHtml(BUSINESS.returnAddress.street)}, ${escapeHtml(BUSINESS.returnAddress.postalCode)} ${escapeHtml(BUSINESS.returnAddress.city)}<br />
    KvK ${BUSINESS.kvk}${isPending(BUSINESS.vatId) ? '' : ` &middot; Btw ${escapeHtml(BUSINESS.vatId)}`}`;

  const html = shell({
    preheader: `Bestelling ${order.order_number} is bevestigd. Totaal ${formatPrice(order.total_cents)}.`,
    inhoud,
    voet,
    origin,
  });

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

/**
 * Deze mail gaat naar élk product waarvoor iemand een melding aanvroeg, dus
 * ook naar hoodies en sokken. Er stond eerst "het gaat om een genummerde
 * oplage" en daarna "we maken in beperkte oplage". Allebei onwaar voor deze
 * producten: alleen de caps zijn genummerd en gelimiteerd, de rest wordt per
 * serie gemaakt en kan terugkomen.
 *
 * Deze tekst doet daarom geen enkele uitspraak over schaarste. Wil je die hier
 * ooit wel doen, dan moet het oplagegegeven van het product mee de functie in;
 * in een vaste tekst is het per definitie fout voor de helft van de catalogus.
 */
export function renderBackInStock(productName: string, size: string, productUrl: string): { subject: string; html: string } {
  const sizeLabel = size && size !== 'One size' ? ` in maat ${escapeHtml(size)}` : '';
  const inhoud = `
    ${titel('Terug op voorraad', 'Hij is er weer.')}
    ${alinea(`Je vroeg ons je te mailen zodra <b>${escapeHtml(productName)}</b>${sizeLabel} terug op voorraad is. Dat moment is nu, zolang de voorraad strekt.`)}
    <div style="margin:0 0 4px;">${knop(productUrl, 'Bekijk het stuk')}</div>`;

  const html = shell({
    preheader: `${productName}${sizeLabel} is terug op voorraad.`,
    inhoud,
    voet: 'Je ontvangt deze mail eenmalig omdat je een voorraadmelding aanvroeg. Was je hem al vergeten? Dan is dit je teken.',
    origin: getSiteOrigin(),
  });
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

  const origin = getSiteOrigin();
  const inhoud = `
    ${titel(`Bestelling ${escapeHtml(order.order_number)}`, `Je bestelling is onderweg, ${escapeHtml(firstName)}.`)}
    ${alinea(`Het pakket is ingepakt en overgedragen aan ${escapeHtml(carrier)}.`)}

    <div style="font-family:${MONO};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${KLEUR.zacht};margin:0 0 6px;">Trackingcode</div>
    <p style="margin:0 0 26px;font-family:${MONO};font-size:17px;letter-spacing:0.05em;color:${KLEUR.ink};">${escapeHtml(order.tracking_number)}</p>

    ${trackUrl ? `<div style="margin:0 0 4px;">${knop(trackUrl, 'Volg je pakket')}</div>` : ''}`;

  const voet = `Vragen over je bestelling? Antwoord op deze mail.<br />
    Je hebt ${BUSINESS.returnDays} dagen bedenktijd vanaf ontvangst en betaalt de retourzending zelf. ${RETURN_FEE_SENTENCE}
    <a href="${origin}/retourneren" style="color:${KLEUR.zacht};text-decoration:underline;">Zo werkt retourneren.</a>`;

  const html = shell({
    preheader: `${escapeHtml(carrier)} heeft je pakket. Code ${order.tracking_number}.`,
    inhoud,
    voet,
    origin,
  });
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
  const inhoud = `
    ${titel('Contactformulier', escapeHtml(m.subject))}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <td style="padding:0 0 6px;font-family:${LETTERTYPE};font-size:13px;color:${KLEUR.zacht};width:96px;">Naam</td>
        <td style="padding:0 0 6px;font-family:${LETTERTYPE};font-size:15px;color:${KLEUR.ink};">${escapeHtml(m.name)}</td>
      </tr>
      <tr>
        <td style="padding:0;font-family:${LETTERTYPE};font-size:13px;color:${KLEUR.zacht};">E-mail</td>
        <td style="padding:0;font-family:${LETTERTYPE};font-size:15px;color:${KLEUR.ink};">
          <a href="mailto:${escapeHtml(m.email)}" style="color:${KLEUR.ink};text-decoration:underline;">${escapeHtml(m.email)}</a>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
      <tr>
        <td width="3" bgcolor="${KLEUR.accent}" style="width:3px;background-color:${KLEUR.accent};font-size:0;line-height:0;">&nbsp;</td>
        <td style="padding:2px 0 2px 16px;font-family:${LETTERTYPE};font-size:15px;line-height:1.7;color:${KLEUR.ink};white-space:pre-wrap;">${escapeHtml(m.message)}</td>
      </tr>
    </table>`;

  const html = shell({
    // Escapen, ook hier: de preheader staat in de HTML en komt van een
    // openbaar formulier.
    preheader: escapeHtml(`${m.name}: ${m.message.slice(0, 90)}`),
    inhoud,
    voet: 'Antwoorden gaat rechtstreeks naar de afzender.',
    origin: getSiteOrigin(),
  });
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

  const inhoud = `
    ${titel('Nieuwe bestelling', escapeHtml(order.order_number))}

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 20px;">
      <tr>
        <td style="padding:0 0 6px;font-family:${LETTERTYPE};font-size:13px;color:${KLEUR.zacht};width:96px;">Bedrag</td>
        <td style="padding:0 0 6px;font-family:${MONO};font-size:15px;color:${KLEUR.ink};">${formatPrice(order.total_cents)}</td>
      </tr>
      <tr>
        <td style="padding:0 0 6px;font-family:${LETTERTYPE};font-size:13px;color:${KLEUR.zacht};">Klant</td>
        <td style="padding:0 0 6px;font-family:${LETTERTYPE};font-size:15px;color:${KLEUR.ink};">${escapeHtml(order.customer_name || '')}</td>
      </tr>
      <tr>
        <td style="padding:0 0 6px;font-family:${LETTERTYPE};font-size:13px;color:${KLEUR.zacht};">E-mail</td>
        <td style="padding:0 0 6px;font-family:${LETTERTYPE};font-size:15px;color:${KLEUR.ink};">${escapeHtml(order.customer_email)}</td>
      </tr>
      <tr>
        <td style="padding:0;font-family:${LETTERTYPE};font-size:13px;color:${KLEUR.zacht};vertical-align:top;">Bezorgen</td>
        <td style="padding:0;font-family:${LETTERTYPE};font-size:15px;line-height:1.55;color:${KLEUR.ink};">${escapeHtml(adres)}</td>
      </tr>
    </table>

    ${lijn('0 0 18px')}

    <ul style="margin:0 0 26px;padding-left:20px;font-family:${LETTERTYPE};font-size:15px;line-height:1.7;color:${KLEUR.ink};">${regels}</ul>

    <div style="margin:0 0 4px;">${knop(beheerUrl, 'Open in beheer')}</div>`;

  const html = shell({
    preheader: `${formatPrice(order.total_cents)} van ${order.customer_name || order.customer_email}.`,
    inhoud,
    voet: 'Zet de bestelling op verzonden zodra het pakket weg is, dan krijgt de klant automatisch de track en trace.',
    origin: getSiteOrigin(),
  });
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
  const inhoud = `
    ${titel(`Bestelling ${escapeHtml(orderNumber)}`, `Je geld is onderweg terug, ${escapeHtml(firstName)}.`)}
    ${alinea(`We hebben ${volledig ? 'het volledige bedrag' : 'een deel'} van je bestelling terugbetaald. Het komt terug op de rekening waarmee je betaalde; je bank heeft daar doorgaans een paar werkdagen voor nodig.`)}

    <div style="font-family:${MONO};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${KLEUR.zacht};margin:0 0 6px;">Terugbetaald</div>
    <p style="margin:0;font-family:${MONO};font-size:24px;color:${KLEUR.ink};">${formatPrice(bedragCents)}</p>`;

  const html = shell({
    preheader: `${formatPrice(bedragCents)} terugbetaald voor bestelling ${orderNumber}.`,
    inhoud,
    voet: 'Klopt er iets niet? Antwoord op deze mail, dan zoeken we het uit.',
    origin: getSiteOrigin(),
  });
  return { subject: `Terugbetaling voor bestelling ${orderNumber}`, html };
}
