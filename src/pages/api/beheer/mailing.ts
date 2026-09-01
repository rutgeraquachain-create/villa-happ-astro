/**
 * POST /api/beheer/mailing
 * Body: { slug: string, actie: 'stand' | 'proef' | 'verstuur', naar?: string, csrf: string }
 *
 * Zet een mailing klaar voor de lijst. Verstuurt niet zelf: dat doet de outbox,
 * met de herpogingen en de afleverregistratie die daar al in zitten.
 *
 * VERZENDEN IS DE ENIGE ONOMKEERBARE HANDELING IN DIT PORTAAL. Een verkeerde
 * prijs kun je corrigeren, een verkeerde mail naar driehonderd mensen niet.
 * Daarom drie afzonderlijke acties in plaats van één knop:
 *
 *   stand     telt wie hem zou krijgen en wie hem al heeft
 *   proef     stuurt hem naar één adres, langs exact dezelfde route
 *   verstuur  zet hem klaar voor de hele lijst
 *
 * `verstuur` eist bovendien dat de mailing op `klaar: true` staat in de
 * contentcollectie. Zo kan een concept dat nog op de branch staat nooit per
 * ongeluk de deur uit.
 */

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { z } from 'zod';
import { vereisSessie } from '../../../lib/beheer';
import { controleerCsrf } from '../../../lib/beheer-sessie';
import { zetMailingKlaar, mailingStand } from '../../../lib/mailing';
import { renderMailing } from '../../../lib/mailing-render';
import { getSiteOrigin } from '../../../lib/site';

export const prerender = false;

const Schema = z.object({
  slug: z.string().min(1).max(80),
  actie: z.enum(['stand', 'proef', 'verstuur']),
  naar: z.email().optional(),
});

function antwoord(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async (ctx) => {
  const sessie = vereisSessie(ctx);
  if (!sessie.ok) return sessie.respons;

  const csrf = new URL(ctx.request.url).searchParams.get('csrf') || '';
  if (!controleerCsrf(sessie.sessieCookie, csrf)) {
    return antwoord({ error: 'Sessie verlopen.' }, 403);
  }

  let body;
  try {
    body = Schema.parse(await ctx.request.json());
  } catch {
    return antwoord({ error: 'Ongeldige invoer' }, 400);
  }

  const mailings = await getCollection('mailings');
  const bron = mailings.find((m) => m.id === body.slug);
  if (!bron) return antwoord({ error: `Onbekende mailing: ${body.slug}` }, 404);

  if (body.actie === 'stand') {
    return antwoord(await mailingStand(body.slug));
  }

  const { subject, html } = renderMailing(
    {
      slug: body.slug,
      onderwerp: bron.data.onderwerp,
      preheader: bron.data.preheader,
      label: bron.data.label,
      titel: bron.data.titel,
      knopTekst: bron.data.knopTekst,
      knopUrl: bron.data.knopUrl,
      body: bron.body ?? '',
    },
    getSiteOrigin(),
  );

  if (body.actie === 'proef') {
    if (!body.naar) return antwoord({ error: 'Geef een adres voor de proefzending' }, 400);
    const uitslag = await zetMailingKlaar({ slug: body.slug, onderwerp: subject, html }, { alleenNaar: body.naar });
    return antwoord({ proef: true, naar: body.naar, ...uitslag });
  }

  // Vanaf hier: de echte zending.
  if (!bron.data.klaar) {
    return antwoord({
      error: 'Deze mailing staat op klaar: false. Zet dat op true en publiceer opnieuw.',
    }, 409);
  }

  const uitslag = await zetMailingKlaar({ slug: body.slug, onderwerp: subject, html });
  console.info('[mailing] Klaargezet:', body.slug, uitslag);
  return antwoord({ verstuurd: true, ...uitslag });
};
