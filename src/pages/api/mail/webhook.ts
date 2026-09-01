/**
 * POST /api/mail/webhook
 *
 * Resend meldt hier wat er met een verstuurde mail gebeurde: afgeleverd,
 * vertraagd, gebounced of als spam gemarkeerd.
 *
 * WAAROM DEZE ROUTE BESTAAT. Tot nu toe zette de outbox `status` op
 * 'verzonden' zodra Resend de POST met 200 beantwoordde, en daar hield het op.
 * Dat betekent "aangenomen", niet "aangekomen". Bij bestelling VH-2026-00001
 * stond de winkeliersmelding op 'verzonden' met nul pogingen en geen fout,
 * terwijl hij nooit in de inbox belandde. Er is zes dagen gezocht in de
 * verkeerde richting omdat het systeem dat verschil niet kende.
 *
 * Openbaar bereikbaar, dus de handtekening is de enige poort. Zonder
 * `RESEND_WEBHOOK_SECRET` geeft deze route 503 en verwerkt hij niets: een
 * webhook die ongetekende meldingen slikt is erger dan geen webhook, want dan
 * kan iedereen jouw orderbevestiging op "gebounced" zetten.
 *
 * Antwoordbeleid richting Svix, die opnieuw probeert bij niet-2xx:
 *   - handtekening fout        -> 401, en niet opnieuw proberen helpt hem niet
 *   - body onleesbaar          -> 400
 *   - al eerder verwerkt       -> 200, want herhaling is geen fout
 *   - database onbereikbaar    -> 500, zodat Svix het straks nog eens doet
 *   - soort die we niet kennen -> 200 en alleen vastleggen
 */

import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import {
  verifieerHandtekening, duidGebeurtenis, magBijwerken, leesDetail, leesOntvanger,
} from '../../../lib/mail-webhook';
import { renderMailAlarm } from '../../../lib/mail';
import { zetInWachtrij } from '../../../lib/outbox';
import { getSiteOrigin } from '../../../lib/site';

export const prerender = false;

/**
 * Waar een alarm heen gaat. Nooit naar `BUSINESS.orderEmail`: dat is precies
 * het adres dat de storing kan hebben, en dan verdwijnt het alarm in dezelfde
 * postbus als het probleem. Staat de variabele niet ingesteld, dan wordt er
 * niets gemaild en blijft het bij de melding in /beheer.
 */
const ALARM_NAAR = import.meta.env.MAIL_ALARM_NAAR;
const WEBHOOK_GEHEIM = import.meta.env.RESEND_WEBHOOK_SECRET;

export const POST: APIRoute = async ({ request }) => {
  if (!WEBHOOK_GEHEIM) {
    console.warn('[mail-webhook] RESEND_WEBHOOK_SECRET niet gezet; melding genegeerd');
    return new Response(JSON.stringify({ error: 'niet-geconfigureerd' }), { status: 503 });
  }

  // De ruwe tekst, niet request.json(). De handtekening is over exact deze
  // bytes gezet; JSON heen en weer halen verandert spaties en volgorde en
  // daarmee de handtekening.
  const body = await request.text();

  const verificatie = verifieerHandtekening({
    geheim: WEBHOOK_GEHEIM,
    svixId: request.headers.get('svix-id'),
    svixTimestamp: request.headers.get('svix-timestamp'),
    svixSignature: request.headers.get('svix-signature'),
    body,
    nuSeconden: Math.floor(Date.now() / 1000),
  });
  if (!verificatie.ok) {
    console.warn('[mail-webhook] geweigerd:', verificatie.reden);
    return new Response(JSON.stringify({ error: verificatie.reden }), { status: 401 });
  }

  let bericht: any;
  try {
    bericht = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: 'body-onleesbaar' }), { status: 400 });
  }

  const sb = getSupabaseAdmin();
  // 500 en niet 200: Svix probeert het dan opnieuw en de gebeurtenis gaat niet
  // verloren doordat de database even weg was.
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 500 });

  const soort: string = typeof bericht?.type === 'string' ? bericht.type : 'onbekend';
  const data = bericht?.data ?? {};
  const providerId: string | null = typeof data.email_id === 'string' ? data.email_id
    : typeof data.id === 'string' ? data.id : null;
  const svixId = request.headers.get('svix-id');

  // De rij erbij zoeken. Lukt dat niet, dan leggen we de gebeurtenis alsnog
  // vast: mail die buiten deze wachtrij om is verstuurd, bijvoorbeeld met de
  // hand vanuit het Resend-dashboard, hoort ook in het logboek.
  let rij: { id: string; soort: string; ontvanger: string; onderwerp: string; aflevering: string } | null = null;
  if (providerId) {
    const { data: gevonden } = await sb
      .from('uitgaande_mail')
      .select('id, soort, ontvanger, onderwerp, aflevering')
      .eq('provider_id', providerId)
      .maybeSingle();
    rij = (gevonden as any) ?? null;
  }

  const duiding = duidGebeurtenis(soort);
  const detail = leesDetail(data);

  // Eerst vastleggen, dan pas afleiden. De unieke index op `svix_id` maakt dit
  // idempotent: probeert Svix het opnieuw omdat ons antwoord niet aankwam, dan
  // botst de tweede insert en slaan we de rest over. Zonder die volgorde zou
  // een herhaling een tweede alarmmail opleveren.
  const { error: insertFout } = await sb.from('mail_gebeurtenissen').insert({
    mail_id: rij?.id ?? null,
    provider_id: providerId,
    soort,
    ontvanger: leesOntvanger(data),
    detail,
    payload: bericht,
    svix_id: svixId,
  });

  if (insertFout) {
    if (insertFout.code === '23505') {
      // Al eerder verwerkt. 200, anders blijft Svix het herhalen.
      return new Response(JSON.stringify({ ok: true, herhaling: true }), { status: 200 });
    }
    console.error('[mail-webhook] vastleggen mislukte:', insertFout.message);
    return new Response(JSON.stringify({ error: 'vastleggen-mislukt' }), { status: 500 });
  }

  // Soort die we niet duiden (opens, clicks): vastgelegd, stand ongemoeid.
  if (!duiding || !rij) {
    return new Response(JSON.stringify({ ok: true, gekoppeld: Boolean(rij) }), { status: 200 });
  }

  if (magBijwerken(rij.aflevering, duiding.aflevering)) {
    await sb
      .from('uitgaande_mail')
      .update({
        aflevering: duiding.aflevering,
        aflevering_op: new Date().toISOString(),
        aflevering_detail: detail,
      })
      .eq('id', rij.id);
  }

  if (duiding.alarm) {
    await alarmeer(rij, duiding.aflevering, detail);
  }

  return new Response(JSON.stringify({ ok: true, aflevering: duiding.aflevering }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/**
 * Meldt een bounce of spamklacht aan een tweede adres.
 *
 * TWEE GRENZEN, allebei nodig om een lawine te voorkomen.
 *
 * Ten eerste: nooit alarmeren over een alarmmail. Bounct het alarm zelf, dan
 * zou dat een nieuw alarm opleveren, dat weer bounct, en zo verder. De
 * `soort`-controle knipt die lus door.
 *
 * Ten tweede: het alarm gaat via de outbox met een dedupe-sleutel per mail, dus
 * twee gebeurtenissen over dezelfde mail leveren één melding op.
 */
async function alarmeer(
  rij: { id: string; soort: string; ontvanger: string; onderwerp: string },
  aflevering: string,
  detail: string | null,
) {
  if (!ALARM_NAAR) {
    console.error('[mail-webhook] ALARM zonder ontvanger:', aflevering, rij.ontvanger, rij.onderwerp);
    return;
  }
  if (rij.soort === 'mail-alarm') {
    console.error('[mail-webhook] Alarmmail kwam zelf niet aan:', rij.ontvanger, detail);
    return;
  }

  const melding = renderMailAlarm({
    aflevering,
    ontvanger: rij.ontvanger,
    onderwerp: rij.onderwerp,
    detail,
    beheerUrl: `${getSiteOrigin()}/beheer`,
  });

  await zetInWachtrij({
    soort: 'mail-alarm',
    ontvanger: ALARM_NAAR,
    onderwerp: melding.subject,
    html: melding.html,
    dedupeSleutel: `mail-alarm:${rij.id}:${aflevering}`,
  });
}
