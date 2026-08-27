/**
 * GET /dev/mail            overzicht van alle transactiemails
 * GET /dev/mail/<slug>     één mail, zoals de klant hem krijgt
 *
 * Waarom deze route bestaat: de mails zijn nooit bekeken voordat ze live
 * gingen. De knop in de orderbevestiging stond in Outlook als donkere tekst op
 * donker, en dat viel pas op bij de eerste echte bestelling van 25 augustus
 * 2026. Een mail die je niet kunt zien zonder af te rekenen, bekijkt niemand.
 *
 * Alleen in ontwikkeling bereikbaar. In een productiebuild is `import.meta.env.DEV`
 * false en geeft deze route een 404, dus hij lekt geen voorbeeldgegevens en
 * verschijnt niet in de sitemap.
 *
 * LET OP: een browser is geen Outlook. Dit bewijst opbouw en inhoud, niet dat
 * de Word-engine het net zo tekent. Voor dat laatste stuur je een testmail naar
 * een echt Outlook-postvak.
 */

import type { APIRoute } from 'astro';
import { voorbeeldMails } from '../../../lib/mail-voorbeeld';
import { getSiteOrigin } from '../../../lib/site';

export const prerender = false;

const NIET_GEVONDEN = new Response('Not found', { status: 404 });

export const GET: APIRoute = ({ params, request }) => {
  if (!import.meta.env.DEV) return NIET_GEVONDEN;

  /**
   * De sjablonen bouwen absolute beeld-URL's op `getSiteOrigin()`, en dat is
   * lokaal poort 4321 terwijl de devserver op een andere poort kan draaien.
   * Dan laadt geen enkele foto en lijkt de mail leeg, terwijl er niets mis is.
   * Voor de preview zetten we de origin daarom om naar die van het verzoek.
   */
  const eigenOrigin = new URL(request.url).origin;
  const naarPreview = (html: string) => html.split(getSiteOrigin()).join(eigenOrigin);

  const slug = (params.slug || '').replace(/^\/+|\/+$/g, '');
  const mails = voorbeeldMails();

  if (!slug) {
    const rijen = mails
      .map(
        (m) =>
          `<li style="margin:0 0 14px;">
             <a href="/dev/mail/${m.slug}" style="font-size:17px;color:#1C1813;">${m.naam}</a>
             <div style="color:#7A705F;font-size:13px;margin-top:2px;">${m.subject}</div>
           </li>`,
      )
      .join('');
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Mailpreviews</title>
       <body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 24px;color:#1C1813;">
         <h1 style="font-weight:normal;">Transactiemails</h1>
         <p style="color:#7A705F;line-height:1.6;">Gerenderd met dezelfde voorbeeldbestelling als de tests.
            Alleen zichtbaar in ontwikkeling.</p>
         <ul style="list-style:none;padding:0;">${rijen}</ul>
       </body>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const mail = mails.find((m) => m.slug === slug);
  if (!mail) return NIET_GEVONDEN;

  return new Response(naarPreview(mail.html), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
