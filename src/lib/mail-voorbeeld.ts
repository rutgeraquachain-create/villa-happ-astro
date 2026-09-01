/**
 * Voorbeelddata voor de transactiemails.
 *
 * Eén set gegevens voor drie afnemers: de dev-route `/dev/mail`, het script
 * `scripts/mail-preview.mjs` en de tests. Zo bekijk je in de browser precies
 * wat de tests controleren, en kan een mail niet stilletjes veranderen zonder
 * dat de preview meegaat.
 *
 * De order bevat bewust twee regels met verschillende beelden en een variant
 * met een lange labelnaam: dat is waar een maillayout als eerste breekt.
 */

import {
  renderOrderConfirmation,
  renderShippingConfirmation,
  renderBackInStock,
  renderTerugbetaling,
  renderNieuweBestelling,
  renderContactMessage,
  renderNieuwsbriefBevestiging,
} from './mail';

export const VOORBEELD_ORDER = {
  order_number: 'VH-2026-00001',
  portaalUrl: 'https://villahapp.nl/bestelling/voorbeeld-token',
  customer_email: 'rutgervanhappen@gmail.com',
  customer_name: 'Rutger van Happen',
  subtotal_cents: 8995,
  shipping_cents: 895,
  total_cents: 9890,
  shipping_address: {
    street: 'Vijzelweg',
    house_number: '18E',
    postal_code: '5145 NK',
    city: 'Waalwijk',
    country: 'NL',
  },
  order_items: [
    {
      product_name: 'Stap voor Stap sokken',
      variant_label: 'Villa Happ / 42-46',
      quantity: 1,
      total_cents: 895,
      image_url: '/img/products/sokken-front-v2.webp',
    },
    {
      product_name: 'Organic Cotton Hoodie',
      variant_label: 'Olijfgroen / L',
      quantity: 1,
      total_cents: 8100,
      image_url: '/img/products/hoodie-olijfgroen-front.webp',
    },
  ],
};

export interface VoorbeeldMail {
  slug: string;
  naam: string;
  subject: string;
  html: string;
}

/** Alle transactiemails, gerenderd met dezelfde voorbeeldbestelling. */
export function voorbeeldMails(): VoorbeeldMail[] {
  return [
    { slug: 'orderbevestiging', naam: 'Orderbevestiging', ...renderOrderConfirmation(VOORBEELD_ORDER) },
    {
      slug: 'verzonden',
      naam: 'Verzendbevestiging',
      ...renderShippingConfirmation({
        order_number: VOORBEELD_ORDER.order_number,
        customer_email: VOORBEELD_ORDER.customer_email,
        customer_name: VOORBEELD_ORDER.customer_name,
        tracking_number: '3STBJG123456789',
        tracking_carrier: 'PostNL',
        shipping_address: { postal_code: '5145 NK', country: 'NL' },
      }),
    },
    {
      slug: 'voorraadmelding',
      naam: 'Terug op voorraad',
      ...renderBackInStock(
        'Organic Cotton Hoodie Olijfgroen',
        'L',
        'https://villahapp.nl/shop/organic-cotton-hoodie-olijfgroen',
      ),
    },
    {
      slug: 'terugbetaling',
      naam: 'Terugbetaling',
      ...renderTerugbetaling(VOORBEELD_ORDER.order_number, VOORBEELD_ORDER.customer_name, 9890, true),
    },
    {
      slug: 'winkelier-nieuwe-order',
      naam: 'Melding aan de winkelier',
      ...renderNieuweBestelling(VOORBEELD_ORDER, 'https://villahapp.nl/beheer/order/voorbeeld'),
    },
    {
      slug: 'nieuwsbrief-bevestiging',
      naam: 'Bevestig je aanmelding',
      // Vaste voorbeeldlink in plaats van een echt token: `bevestigUrl` heeft
      // AUTH_SECRET nodig en dat is er in CI niet. De vorm is gelijk, en wat
      // deze mail moet bewijzen is de opmaak, niet de handtekening.
      ...renderNieuwsbriefBevestiging(
        'anouk@voorbeeld.nl',
        'https://villahapp.nl/nieuwsbrief/bevestigen?t=voorbeeld-token',
      ),
    },
    {
      slug: 'contactformulier',
      naam: 'Contactformulier',
      ...renderContactMessage({
        name: 'Anouk de Wit',
        email: 'anouk@voorbeeld.nl',
        subject: 'Vraag over maten',
        message:
          'Hoi,\n\nIk twijfel tussen maat M en L voor de hoodie.\nIk ben 1,78 m. Wat raden jullie aan?\n\nGroet,\nAnouk',
      }),
    },
  ];
}
