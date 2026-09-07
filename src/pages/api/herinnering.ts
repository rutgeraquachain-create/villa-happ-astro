/**
 * POST /api/herinnering
 * Body: { naam, email, herinnering, nieuwsbrief?, magArchief?, magNaam? }
 *
 * De inzending voor de herinneringsactie. Legt het verhaal vast, geeft een
 * inzendnummer terug, en stuurt een bevestiging met dat nummer erin zodat de
 * deelnemer zijn foto herkenbaar kan mailen.
 *
 * DRIE DINGEN DIE HIER LOS VAN ELKAAR STAAN
 * -----------------------------------------
 * Meedoen, de foto in het archief mogen zetten, en de nieuwsbrief. Drie vinkjes,
 * drie kolommen, en geen van drieën is voorwaarde voor de ander. Zie de
 * toelichting in src/lib/herinnering.ts voor waarom dat niet anders kan.
 *
 * De nieuwsbriefaanmelding loopt langs precies dezelfde weg als het gewone
 * formulier: onbevestigd wegschrijven plus een bevestigingsmail. Dit adres is
 * ingetypt en niet bewezen, dus de uitzondering die bij het afrekenen geldt
 * gaat hier niet op.
 */

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSupabaseAdmin } from '../../lib/supabase';
import { rateLimit, clientKey, tooManyRequests } from '../../lib/rate-limit';
import { normaliseerEmail, inschrijfstand, bevestigUrl } from '../../lib/nieuwsbrief';
import { renderHerinneringOntvangen, renderNieuwsbriefBevestiging } from '../../lib/mail';
import { zetInWachtrij } from '../../lib/outbox';
import { getSiteOrigin } from '../../lib/site';
import { authSecretOntbreekt } from '../../lib/order-token';
import {
  ACTIE, isGesloten, naamGeldig, herinneringGeldig, nummerGeldig,
  HERINNERING_MIN, HERINNERING_MAX,
} from '../../lib/herinnering';
import { magBevestigingVersturen, domeinGeweigerd } from '../../lib/aanmeldrem';

export const prerender = false;

const Schema = z.object({
  naam: z.string().refine(naamGeldig, 'Vul je naam in.'),
  // Met eigen tekst, anders lekt de Engelse standaardmelding van zod naar het
  // scherm. De route geeft de eerste melding letterlijk door aan de bezoeker.
  email: z.email('Vul een geldig e-mailadres in.'),
  herinnering: z.string().refine(
    herinneringGeldig,
    `Schrijf minstens ${HERINNERING_MIN} tekens en hoogstens ${HERINNERING_MAX}.`,
  ),
  nieuwsbrief: z.boolean().optional().default(false),
  magArchief: z.boolean().optional().default(false),
  magNaam: z.boolean().optional().default(false),
  /** Honeypot. De pagina houdt hem al tegen; dit dekt een rechtstreekse POST. */
  bedrijf: z.string().optional(),
});

function fout(message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, message }), { status });
}

export const POST: APIRoute = async ({ request }) => {
  // Ruimer dan bij de nieuwsbrief: iemand die zijn verhaal kwijtraakt en
  // opnieuw indient mag niet na twee pogingen buitengesloten worden.
  if (!rateLimit(clientKey(request, 'herinnering'), 8)) return tooManyRequests();

  if (isGesloten()) {
    return fout('De actie is gesloten. Bedankt voor je belangstelling.', 410);
  }

  let body;
  try {
    body = Schema.parse(await request.json());
  } catch (err) {
    const eerste = (err as { issues?: { message: string }[] })?.issues?.[0]?.message;
    return fout(eerste || 'Controleer de velden en probeer opnieuw.');
  }

  /**
   * Honeypot gevuld: bot. Doen alsof het gelukt is, met een nummer dat nergens
   * bestaat, en niets wegschrijven. Een foutmelding laat hem variëren.
   */
  if (body.bedrijf) {
    console.warn('[herinnering] Honeypot gevuld; inzending genegeerd.');
    return new Response(JSON.stringify({
      success: true, nummer: 'HH-0000-0000', fotoAdres: ACTIE.fotoAdres,
      message: 'Je inzending is binnen.', mailVerstuurd: false,
    }));
  }

  const email = normaliseerEmail(body.email);

  if (domeinGeweigerd(email)) {
    console.warn('[herinnering] Geweigerd domein; inzending genegeerd.');
    return fout('Dit e-mailadres kunnen we niet gebruiken. Vul er een ander in.');
  }

  if (authSecretOntbreekt() && body.nieuwsbrief) {
    // Zonder secret is er geen bevestigingslink voor de nieuwsbrief. De
    // inzending zelf kan wel door, dus dit is geen reden om alles te weigeren.
    console.error('[herinnering] AUTH_SECRET ontbreekt; nieuwsbriefaanmelding overgeslagen.');
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    // Niets opgeslagen betekent niets bevestigen. Anders denkt iemand dat zijn
    // verhaal meedoet terwijl het nergens staat.
    console.warn('[herinnering] Geen database; inzending NIET opgeslagen voor:', email);
    return fout('Inzenden kan nu even niet. Probeer het later opnieuw.', 503);
  }

  /**
   * Nummer eerst, en geen zelfverzonnen terugval. Dat is dezelfde regel als bij
   * de bestelnummers: een verzonnen nummer vergiftigt de reeks, en hier is het
   * nummer bovendien het enige waarmee de foto straks bij het verhaal komt.
   */
  const { data: nummerData, error: nummerFout } = await sb.rpc('generate_herinnering_nummer');
  const nummer = typeof nummerData === 'string' ? nummerData : null;
  if (nummerFout || !nummerGeldig(nummer)) {
    console.error('[herinnering] generate_herinnering_nummer faalde:', nummerFout);
    return fout('Inzenden lukt nu even niet. Probeer het zo opnieuw.', 503);
  }

  const { error } = await sb.from('herinneringen').insert({
    nummer,
    naam: body.naam.trim(),
    email,
    herinnering: body.herinnering.trim(),
    mag_archief: body.magArchief,
    mag_naam: body.magNaam,
    nieuwsbrief: body.nieuwsbrief,
  });

  if (error) {
    // Unieke index op het adres: deze persoon deed al mee.
    if (error.code === '23505') {
      return fout('Je hebt al een herinnering ingestuurd. Eén inzending per persoon.', 409);
    }
    console.error('[herinnering] Vastleggen mislukte:', error.message);
    return fout('Er ging iets mis. Probeer opnieuw.', 500);
  }

  // Bevestiging met het nummer erin. Mislukt dit, dan staat de inzending er wel
  // en weet de deelnemer zijn nummer niet, dus dat melden we eerlijk.
  const mail = renderHerinneringOntvangen(body.naam, nummer!, ACTIE.fotoAdres);
  const { vastgelegd } = await zetInWachtrij({
    soort: 'herinnering-ontvangen',
    ontvanger: email,
    onderwerp: mail.subject,
    html: mail.html,
    dedupeSleutel: `herinnering:${nummer}`,
  });

  await meldAanVoorNieuwsbrief(sb, email, body.nieuwsbrief);

  return new Response(JSON.stringify({
    success: true,
    nummer,
    fotoAdres: ACTIE.fotoAdres,
    message: vastgelegd
      ? `Je inzending is binnen onder nummer ${nummer}. Je krijgt er een mail over.`
      : `Je inzending is binnen onder nummer ${nummer}. De bevestigingsmail kwam er niet uit, dus noteer dit nummer even.`,
    mailVerstuurd: vastgelegd,
  }));
};

/**
 * De losse nieuwsbriefaanmelding.
 *
 * Faalt dit, dan is dat geen reden om de inzending te laten struikelen: het
 * verhaal staat er al en de deelnemer heeft zijn nummer nodig. Vandaar dat de
 * fout hier gelogd wordt en niet omhoog gaat.
 */
async function meldAanVoorNieuwsbrief(
  sb: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  email: string,
  wil: boolean,
): Promise<void> {
  if (!wil || authSecretOntbreekt()) return;

  const { data: bestaand } = await sb
    .from('newsletter_subscribers')
    .select('confirmed, unsubscribed_at')
    .eq('email', email)
    .maybeSingle();

  // Al actief: geen tweede bevestigingsmail. Die leest als spam.
  if (inschrijfstand(bestaand) === 'actief') return;

  // Dezelfde rem als bij het gewone formulier. Zonder deze regel zou deze route
  // een tweede weg naar buiten zijn voor precies het misbruik van 4 september.
  if (!(await magBevestigingVersturen(sb))) return;

  const { error } = await sb.from('newsletter_subscribers').upsert({
    email,
    source: 'herinnering',
    confirmed: false,
  }, { onConflict: 'email' });

  if (error) {
    console.error('[herinnering] Nieuwsbriefaanmelding mislukte:', error.message);
    return;
  }

  const mail = renderNieuwsbriefBevestiging(email, bevestigUrl(getSiteOrigin(), email));
  await zetInWachtrij({
    soort: 'nieuwsbrief-bevestiging',
    ontvanger: email,
    onderwerp: mail.subject,
    html: mail.html,
    dedupeSleutel: `nieuwsbrief-bevestiging:${email}:${new Date().toISOString().slice(0, 10)}`,
  });
}
