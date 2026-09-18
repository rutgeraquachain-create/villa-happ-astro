import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getCatalog } from '../lib/catalog';
import { getSiteOrigin } from '../lib/site';

export const prerender = true;

/**
 * Indexeerbare routes. Transactiepagina's (cart, checkout, wishlist) staan
 * er bewust niet in, en `drops` evenmin: dat is nog een lege placeholder.
 * Een sitemap die naar dunne pagina's wijst kost crawlbudget en levert alleen
 * maar "thin content"-signalen op. Vul je hem, zet hem dan hier terug én haal
 * de noindex uit die pagina.
 *
 * `brands` (VH_APProved) volgt de catalogus: hij staat erin zodra er een
 * merkproduct gepubliceerd is, precies wanneer de pagina zelf zijn noindex
 * laat vallen. Twee plekken, één voorwaarde.
 */
const staticRoutes = [
  '', 'shop', 'goods', 'story', 'het-atelier', 'journal', 'pers',
  'faq', 'verzending', 'retourneren', 'contact', 'voor-merken',
  'verkooppunt-worden',
  'privacy', 'algemene-voorwaarden', 'herroeping', 'cookies',
];

export const GET: APIRoute = async () => {
  const site = getSiteOrigin();
  const catalog = await getCatalog();
  const posts = await getCollection('journal');
  const buildDate = new Date().toISOString().slice(0, 10);
  // Journal-artikelen krijgen hun eigen publicatiedatum als lastmod: een
  // echter signaal voor crawlers dan de generieke build-datum.
  const heeftMerken = catalog.some((p) => p.merk);
  const urls: { loc: string; lastmod: string }[] = [
    ...staticRoutes.map((r) => ({ loc: `${site}/${r}`, lastmod: buildDate })),
    ...(heeftMerken ? [{ loc: `${site}/brands`, lastmod: buildDate }] : []),
    ...catalog.map((p) => ({ loc: `${site}/shop/${p.slug}`, lastmod: buildDate })),
    ...posts.map((p) => ({ loc: `${site}/journal/${p.id}`, lastmod: p.data.date.toISOString().slice(0, 10) })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
