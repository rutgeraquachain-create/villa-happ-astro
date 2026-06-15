import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/catalog';

export const prerender = true;

const SITE = 'https://villa-happ-astro.vercel.app';

// Indexeerbare routes (transactiepagina's bewust weggelaten)
const staticRoutes = ['', 'shop', 'story', 'drops', 'brands', 'journal', 'faq', 'verzending', 'retourneren', 'contact'];

export const GET: APIRoute = async () => {
  const catalog = await getCatalog();
  const urls = [
    ...staticRoutes.map((r) => `${SITE}/${r}`),
    ...catalog.map((p) => `${SITE}/shop/${p.slug}`),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
