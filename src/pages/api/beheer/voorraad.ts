/**
 * POST /api/beheer/voorraad — voorraad bijstellen
 *
 * Body: { variantId, verschil, reden, csrf }
 *
 * Dezelfde drie poorten als bij de orderacties:
 *  1. sessie (404 bij afwijzing, niet 403: een vreemde hoeft niet te weten
 *     dat dit bestaat);
 *  2. CSRF-token dat aan die sessie hangt;
 *  3. de database zelf, die de mutatie atomair toepast en weigert wanneer de
 *     stand onder nul of onder het gereserveerde aantal zou komen.
 *
 * Er gaat bewust een verschil over de lijn en geen nieuwe stand. Zie de
 * toelichting in src/lib/voorraad.ts: met een absolute waarde overschrijf je
 * een bestelling die tussendoor binnenkwam.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { vereisSessie, vereisDatabase } from '../../../lib/beheer';
import { controleerCsrf } from '../../../lib/beheer-sessie';

export const prerender = false;

const Schema = z.object({
  variantId: z.uuid(),
  // Ruim genoeg voor een pallet, krap genoeg om een typefout van vijf cijfers
  // tegen te houden.
  verschil: z.number().int().refine((n) => n !== 0 && Math.abs(n) <= 10000, {
    message: 'Verschil moet tussen -10000 en 10000 liggen en niet nul zijn.',
  }),
  reden: z.string().trim().min(2).max(200),
  csrf: z.string().min(16),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async (ctx) => {
  const sessie = vereisSessie(ctx);
  if (!sessie.ok) return sessie.respons;

  let body;
  try {
    body = Schema.parse(await ctx.request.json());
  } catch {
    return json({ error: 'Ongeldig verzoek.' }, 400);
  }

  if (!controleerCsrf(sessie.sessieCookie, body.csrf)) {
    return json({ error: 'Sessie verlopen. Laad de pagina opnieuw.' }, 403);
  }

  const db = vereisDatabase();
  if (!db.ok) return db.respons;
  const { sb } = db;

  const { data, error } = await sb.rpc('muteer_voorraad', {
    p_variant_id: body.variantId,
    p_verschil: body.verschil,
    p_reden: body.reden,
  });

  if (error) {
    console.error('[voorraad] muteer_voorraad faalde:', error);
    return json({ error: 'Bijwerken lukte niet. Probeer het opnieuw.' }, 500);
  }

  // NULL betekent: de database heeft de mutatie geweigerd. Dat is geen fout
  // maar een regel, dus een 409 en een uitleg die zegt wat er aan de hand is.
  if (data === null) {
    const { data: rij } = await sb
      .from('inventory')
      .select('quantity, reserved')
      .eq('variant_id', body.variantId)
      .maybeSingle();

    if (!rij) return json({ error: 'Deze variant bestaat niet.' }, 404);

    const nieuw = rij.quantity + body.verschil;
    const reden =
      nieuw < 0
        ? `Dat brengt de voorraad op ${nieuw}. Minder dan nul kan niet.`
        : `Er staan ${rij.reserved} stuks gereserveerd voor lopende bestellingen. ` +
          'Je kunt niet onder dat aantal afboeken.';
    return json({ error: reden, aantal: rij.quantity, gereserveerd: rij.reserved }, 409);
  }

  return json({ success: true, aantal: data });
};
