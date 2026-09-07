/**
 * POST /api/beheer/herinnering?csrf=<token>
 * Body: { id: string, status: Status }
 *
 * Zet de status van één inzending. Dat is de enige schrijfhandeling die het
 * beheerscherm kent: geen bewerken van andermans verhaal, geen verwijderen.
 *
 * WAAROM ER GEEN VERWIJDERKNOP IS, EN WEL EEN INTREKKNOP
 * ------------------------------------------------------
 * Een inzending is iemands herinnering plus zijn toestemmingsverklaring. Die
 * verklaring is het bewijsstuk waarmee je later kunt aantonen dat je die foto
 * mócht gebruiken (AVG art. 7 lid 1). Wie de rij wegklikt gooit dat bewijs weg.
 * Voor "doet niet mee" is er een status, en die is omkeerbaar.
 *
 * Maar die redenering ging één stap te ver. Toestemming intrekken moet even
 * makkelijk zijn als toestemming geven (art. 7 lid 3), en zonder handeling in
 * beheer kun je een intrekking niet uitvoeren. Iemand die mailt dat zijn foto
 * er toch niet op mag, hoort dat geregeld te krijgen.
 *
 * Vandaar `intrekken`: de foto gaat uit de opslag, de twee gebruiksvinkjes gaan
 * op nee, en er komt een datum bij te staan. De rij blijft, want die legt vast
 * dát er is ingetrokken en wanneer. Dat is precies het bewijs dat je daarna
 * nodig hebt.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { vereisSessie } from '../../../lib/beheer';
import { controleerCsrf } from '../../../lib/beheer-sessie';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { STATUSSEN } from '../../../lib/herinnering-beheer';

export const prerender = false;

const Schema = z.union([
  z.object({ actie: z.literal('status'), id: z.uuid(), status: z.enum(STATUSSEN) }),
  z.object({ actie: z.literal('intrekken'), id: z.uuid() }),
]);

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

  const sb = getSupabaseAdmin();
  if (!sb) return antwoord({ error: 'Geen database' }, 503);

  if (body.actie === 'status') {
    const { error } = await sb
      .from('herinneringen')
      .update({ status: body.status })
      .eq('id', body.id);

    if (error) {
      console.error('[herinnering] Status zetten mislukte:', error.message);
      return antwoord({ error: 'Opslaan mislukte' }, 500);
    }
    return antwoord({ success: true, status: body.status });
  }

  /* ---------- Intrekken ---------- */

  const { data: rij, error: leesFout } = await sb
    .from('herinneringen')
    .select('foto_pad')
    .eq('id', body.id)
    .maybeSingle();

  if (leesFout || !rij) {
    console.error('[herinnering] Inzending niet gevonden bij intrekken:', leesFout?.message);
    return antwoord({ error: 'Inzending niet gevonden' }, 404);
  }

  /**
   * Eerst het bestand weg, dan pas de rij bijwerken.
   *
   * Andersom zou de rij zeggen dat er is ingetrokken terwijl de foto nog in de
   * opslag ligt, en dan denkt iedereen die het naleest dat het geregeld is.
   * Mislukt het verwijderen, dan stopt de handeling en blijft de vlag staan, zodat
   * er iemand naar kijkt.
   */
  if (rij.foto_pad) {
    const { error: wisFout } = await sb.storage.from('herinneringen').remove([rij.foto_pad]);
    if (wisFout) {
      console.error('[herinnering] Foto verwijderen mislukte bij intrekken:', wisFout.message);
      return antwoord({ error: 'De foto kon niet verwijderd worden. Niets gewijzigd.' }, 500);
    }
  }

  const { error } = await sb
    .from('herinneringen')
    .update({
      mag_archief: false,
      mag_naam: false,
      foto_pad: null,
      foto_type: null,
      foto_bytes: null,
      ingetrokken_op: new Date().toISOString(),
      status: 'afgewezen',
    })
    .eq('id', body.id);

  if (error) {
    console.error('[herinnering] Intrekken vastleggen mislukte:', error.message);
    return antwoord({ error: 'De foto is weg maar de rij is niet bijgewerkt. Kijk hiernaar.' }, 500);
  }

  return antwoord({ success: true, ingetrokken: true });
};
