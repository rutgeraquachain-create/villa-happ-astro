/**
 * POST /api/beheer/tegoedbon — een tegoedbon uitgeven
 *
 * Body: { waardeEuro, notitie, maanden, csrf }
 *
 * Dezelfde drie poorten als de andere beheerroutes: sessie, CSRF-token dat aan
 * die sessie hangt, en de database. De code wordt hier gemaakt en niet door de
 * beheerder ingevoerd: een zelfbedachte code is te raden, en deze bon is geld.
 *
 * De bon staat los van de winnaar. Er komt geen e-mailadres aan te pas, want de
 * actievoorwaarden koppelen de bon niet aan een persoon: hij is te besteden in
 * de webshop en niet inwisselbaar voor geld. Wie hem doorgeeft, geeft hem door.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { vereisSessie, vereisDatabase } from '../../../lib/beheer';
import { controleerCsrf } from '../../../lib/beheer-sessie';
import { maakCode, verlooptOver } from '../../../lib/tegoedbon';

export const prerender = false;

const Schema = z.object({
  /**
   * In hele euro's, want dat is wat een mens intypt. De bovengrens van 500 is
   * geen wet maar een vangrail: één typefout van drie nullen maakt van 75 euro
   * een bon van 75.000, en die staat dan geldig in de database.
   */
  waardeEuro: z.number().int().min(1).max(500),
  notitie: z.string().trim().min(2).max(200),
  /** Twaalf maanden is wat de actievoorwaarden beloven. */
  maanden: z.number().int().min(1).max(60).default(12),
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

  /**
   * Botst de code met een bestaande, dan opnieuw proberen.
   *
   * Met 29 tekens over acht posities is een botsing bij enkele tientallen
   * bonnen praktisch uitgesloten, maar "praktisch uitgesloten" is geen
   * afhandeling. De unieke index in de database is de echte poort; dit is de
   * nette lus ervoor. Drie pogingen, dan een eerlijke fout.
   */
  for (let poging = 0; poging < 3; poging++) {
    const code = maakCode();
    const { data, error } = await sb
      .from('tegoedbonnen')
      .insert({
        code,
        waarde_cents: body.waardeEuro * 100,
        notitie: body.notitie,
        verloopt_op: verlooptOver(body.maanden).toISOString(),
      })
      .select('code, waarde_cents, verloopt_op')
      .single();

    if (!error && data) return json({ success: true, bon: data });
    if (error?.code !== '23505') {
      console.error('[tegoedbon] Aanmaken mislukte:', error?.message);
      return json({ error: 'Aanmaken lukte niet. Probeer het opnieuw.' }, 500);
    }
  }

  return json({ error: 'Kon geen vrije code vinden. Probeer het opnieuw.' }, 503);
};
