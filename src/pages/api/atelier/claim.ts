/**
 * POST /api/atelier/claim — claim je nummer in de oplage
 *
 * Body: { email, name?, garment? }
 * Kent een nummer toe in de genummerde oplage, schrijft de claim weg en
 * schrijft het e-mailadres in voor de nieuwsbrief/drop. Idempotent: wie
 * al geclaimd heeft, krijgt hetzelfde nummer terug.
 *
 * Zonder database 503; het Atelier valt dan terug op een lokaal
 * gegenereerd nummer (demo-gedrag, net als reviews/back-in-stock).
 */

import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { rateLimit, clientKey, tooManyRequests } from '../../../lib/rate-limit';
import { ClaimSchema, nextNumber, EDITION } from '../../../lib/atelier';
import { domeinGeweigerd, schoneBron } from '../../../lib/aanmeldrem';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!rateLimit(clientKey(request, 'atelier'), 5)) return tooManyRequests();

  /**
   * Alleen formuliergegevens. JSON gaat er niet meer in.
   *
   * WAAROM DIT ER MOEST KOMEN
   * Gemeten 8 september 2026. Van de vierenvijftig claims op de oplage waren er
   * eenenvijftig van een bot, met namen als `TETIwqFJdiYxYuHofVOK` en adressen
   * als `b.ro.ck.jo.hnl.c.o.w.an.ltd@gmail.com` (Gmail negeert punten, dus dat
   * is één postbus die zich voordoet als vele). Elf daarvan kwamen binnen nadat
   * het aanmeld- en het inzendformulier al dicht waren: de bot verhuisde
   * hierheen.
   *
   * Dit is de duurste van de drie routes. Een nummer uit een oplage van 500 met
   * certificaat is schaars, en wat hier weg is komt niet terug.
   *
   * Astro weigert formuliergecodeerde berichten van een andere site. Op JSON
   * geldt die controle niet, en dat was precies de weg naar binnen. De pagina
   * stuurt sinds deze wijziging een formulier, dus dit kost de bezoeker niets.
   */
  const contentType = request.headers.get('content-type') || '';
  const isFormulier = contentType.includes('multipart/form-data')
    || contentType.includes('application/x-www-form-urlencoded');
  if (!isFormulier) {
    console.warn('[atelier] Claim zonder formulier geweigerd:', contentType.slice(0, 40));
    return new Response(JSON.stringify({
      error: 'Claim je nummer via het formulier op de site.',
    }), { status: 415 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  let body;
  let honeypot: string | undefined;
  try {
    const fd = await request.formData();
    const kies = (naam: string) => {
      const v = fd.get(naam);
      return typeof v === 'string' && v.length > 0 ? v : undefined;
    };
    honeypot = kies('bedrijf');
    body = ClaimSchema.parse({
      email: kies('email') ?? '',
      name: kies('name'),
      garment: kies('garment'),
      // Een niet-aangevinkt vakje zit niet in de FormData.
      newsletter: fd.get('newsletter') === '1',
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Vul een geldig e-mailadres in.' }), { status: 400 });
  }

  /**
   * Honeypot gevuld: bot. Een verzonnen nummer teruggeven en niets vastleggen.
   * Een foutmelding laat hem variëren tot hij er wel doorkomt, en een echt
   * nummer zou een plek uit de oplage kosten.
   */
  if (honeypot) {
    console.warn('[atelier] Honeypot gevuld; claim genegeerd.');
    return new Response(JSON.stringify({ number: 0, edition: EDITION, returning: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Sms-gateways en verwanten. Zie lib/aanmeldrem.ts.
  if (domeinGeweigerd(body.email)) {
    console.warn('[atelier] Geweigerd domein; claim genegeerd.');
    return new Response(JSON.stringify({ number: 0, edition: EDITION, returning: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Al geclaimd? Geef hetzelfde nummer terug (idempotent).
  const { data: bestaand } = await sb
    .from('atelier_claims')
    .select('number, edition')
    .eq('email', body.email)
    .maybeSingle();

  if (bestaand) {
    return new Response(JSON.stringify({ number: bestaand.number, edition: bestaand.edition, returning: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Nummer uit een Postgres-sequence: atomair, dus twee gelijktijdige claims
  // kunnen nooit hetzelfde "unieke" nummer krijgen. Tellen-en-optellen deed
  // dat wél. Ontbreekt de functie nog, dan valt hij terug op de telling.
  let number: number;
  const { data: seq, error: seqErr } = await sb.rpc('next_atelier_number', { p_edition: EDITION });
  if (!seqErr && typeof seq === 'number') {
    number = seq;
  } else {
    const { count } = await sb.from('atelier_claims').select('*', { count: 'exact', head: true });
    number = nextNumber(count || 0);
  }

  const { error } = await sb.from('atelier_claims').insert({
    email: body.email,
    name: body.name,
    garment: body.garment,
    number,
    edition: EDITION,
  });

  // Botsing (iemand claimde net gelijktijdig): lees het bestaande nummer terug.
  if (error) {
    const { data: retry } = await sb
      .from('atelier_claims')
      .select('number, edition')
      .eq('email', body.email)
      .maybeSingle();
    if (retry) {
      return new Response(JSON.stringify({ number: retry.number, edition: retry.edition, returning: true }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ error: 'Claimen mislukte, probeer opnieuw.' }), { status: 500 });
  }

  // Alleen inschrijven als er expliciet toestemming is gegeven. Eerder
  // gebeurde dit bij élke claim, terwijl het formulier alleen mail over
  // "deze oplage" beloofde.
  if (body.newsletter) {
    await sb.from('newsletter_subscribers')
      .upsert({ email: body.email, source: schoneBron('atelier') }, { onConflict: 'email' })
      .then(() => null, () => null);
  }

  return new Response(JSON.stringify({ number, edition: EDITION }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
