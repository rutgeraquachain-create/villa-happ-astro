/**
 * Rendert elke transactiemail naar een HTML-bestand, zodat je hem kunt
 * bekijken zonder een bestelling te plaatsen.
 *
 * Waarom dit bestaat: de vorige mails zijn nooit bekeken voordat ze live
 * gingen. De knop "Volg je bestelling" stond in Outlook als donkere tekst op
 * donker, en dat viel pas op bij de eerste echte bestelling.
 *
 * Draaien: npx vite-node scripts/mail-preview.mjs
 *
 * Via vite-node en niet via node: de sjablonen importeren TypeScript zonder
 * bestandsextensie en lezen `import.meta.env`. Node lost geen van beide op.
 *
 * De uitvoer staat in .mailpreview/ en is gitignored.
 *
 * LET OP: dit rendert in een browser, en een browser is niet Outlook. Het
 * bewijst de opbouw en de inhoud, niet dat Word het net zo tekent. Voor dat
 * laatste is een testverzending naar een echt Outlook-postvak nodig.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DOEL = join(WORTEL, '.mailpreview');

// De sjablonen lezen `import.meta.env`; buiten Astro bestaat dat niet.
process.env.PUBLIC_SITE_URL ||= 'https://villahapp.nl';

const VOORBEELDORDER = {
  order_number: 'VH-2026-00001',
  portaalUrl: 'https://villahapp.nl/bestelling/voorbeeld-token',
  customer_email: 'rutgervanhappen@gmail.com',
  customer_name: 'Rutger van Happen',
  subtotal_cents: 8995,
  shipping_cents: 895,
  total_cents: 9890,
  shipping_address: {
    street: 'Vijzelweg', house_number: '18E',
    postal_code: '5145 NK', city: 'Waalwijk', country: 'NL',
  },
  order_items: [
    {
      product_name: 'Stap voor Stap sokken', variant_label: 'Villa Happ / 42-46',
      quantity: 1, total_cents: 895, image_url: '/img/products/sokken-front.webp',
    },
    {
      product_name: 'Organic Cotton Hoodie', variant_label: 'Olijfgroen / L',
      quantity: 1, total_cents: 8100, image_url: '/img/products/hoodie-olijfgroen-front.webp',
    },
  ],
};

async function main() {
  const mail = await import('../src/lib/mail.ts');
  await mkdir(DOEL, { recursive: true });

  const mails = [
    ['orderbevestiging', mail.renderOrderConfirmation(VOORBEELDORDER)],
    ['verzonden', mail.renderShippingConfirmation({
      order_number: 'VH-2026-00001',
      customer_email: VOORBEELDORDER.customer_email,
      customer_name: VOORBEELDORDER.customer_name,
      tracking_number: '3STBJG123456789',
      tracking_carrier: 'PostNL',
      shipping_address: { postal_code: '5145 NK', country: 'NL' },
    })],
    ['voorraadmelding', mail.renderBackInStock(
      'Organic Cotton Hoodie Olijfgroen', 'L', 'https://villahapp.nl/shop/organic-cotton-hoodie-olijfgroen')],
    ['terugbetaling', mail.renderTerugbetaling('VH-2026-00001', 'Rutger van Happen', 9890, true)],
    ['winkelier-nieuwe-order', mail.renderNieuweBestelling(
      VOORBEELDORDER, 'https://villahapp.nl/beheer/order/voorbeeld')],
    ['contactformulier', mail.renderContactMessage({
      name: 'Anouk de Wit',
      email: 'anouk@voorbeeld.nl',
      subject: 'Vraag over maten',
      message: 'Hoi,\n\nIk twijfel tussen maat M en L voor de hoodie.\nIk ben 1,78 m. Wat raden jullie aan?\n\nGroet,\nAnouk',
    })],
  ];

  const index = [];
  for (const [naam, { subject, html }] of mails) {
    await writeFile(join(DOEL, `${naam}.html`), html, 'utf-8');
    index.push(`<li><a href="./${naam}.html">${naam}</a><br><small>${subject}</small></li>`);
    console.log(`${naam}.html  ${subject}`);
  }

  await writeFile(join(DOEL, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Mailpreviews</title>
     <body style="font-family:system-ui;padding:32px;line-height:1.8">
     <h1>Villa Happ mailpreviews</h1><ul>${index.join('')}</ul>`, 'utf-8');

  console.log(`\n${mails.length} previews in .mailpreview/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
