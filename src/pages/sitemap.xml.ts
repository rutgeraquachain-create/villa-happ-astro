import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { getCatalog } from '../lib/catalog';
import { getSiteOrigin } from '../lib/site';

export const prerender = true;

// Indexeerbare routes (transactiepagina's bewust weggelaten)
const staticRoutes = ['', 'shop', 'story', 'drops', 'brands', 'journal', 'faq', 'verzending', 'retourneren', 'contact'];

export const GET: APIRoute = async () => {
  const site = getSiteOrigin();
  const catalog = await getCatalog();
  const posts = await getCollection('journal');
  const buildDate = new Date().toISOString().slice(0, 10);
  // Journal-artikelen krijgen hun eigen publicatiedatum als lastmod: een
  // echter signaal voor crawlers dan de generieke build-datum.
  const urls: { loc: string; lastmod: string }[] = [
    ...staticRoutes.map((r) => ({ loc: `${site}/${r}`, lastmod: buildDate })),
    ...catalog.map((p) => ({ loc: `${site}/shop/${p.slug}`, lastmod: buildDate })),
    ...posts.map((p) => ({ loc: `${site}/journal/${p.id}`, lastmod: p.data.date.toISOString().slice(0, 10) })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
