import type { APIRoute } from 'astro';
import { getSiteOrigin, isPreviewHost } from '../lib/site';

export const prerender = true;

export const GET: APIRoute = () => {
  const origin = getSiteOrigin();

  // Preview (*.vercel.app): volledig buiten de index houden, anders
  // concurreert deze omgeving met de echte site op villa-happ.nl.
  // Productie: iedereen (incl. AI-crawlers als GPTBot, ClaudeBot,
  // PerplexityBot en Google-Extended) mag alles behalve de transactie-
  // en API-paden. Voor GEO willen we die bots juist binnen; het `*`-blok
  // verwelkomt ze al. De verwijzing naar /llms.txt geeft ze een schone
  // Markdown-ingang met de kernfeiten.
  const body = isPreviewHost(origin)
    ? `User-agent: *\nDisallow: /\n`
    : `User-agent: *\nAllow: /\nDisallow: /checkout\nDisallow: /cart\nDisallow: /wishlist\nDisallow: /api/\n\n# LLM-gids: ${origin}/llms.txt\nSitemap: ${origin}/sitemap.xml\n`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
