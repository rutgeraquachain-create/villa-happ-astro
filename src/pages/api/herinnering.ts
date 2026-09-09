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
  HERINNERING_MIN_WOORDEN, HERINNERING_MAX,
} from '../../lib/herinnering';
import {
  magBevestigingVersturen, magInzendbevestigingVersturen, domeinGeweigerd,
} from '../../lib/aanmeldrem';
import { keurFoto, FOTO_MELDING, fotoPad } from '../../lib/herinnering-foto';
import { isMultipartPost } from '../../lib/formulierpost';

export const prerender = false;

const Schema = z.object({
  naam: z.string().refine(naamGeldig, 'Vul je naam in.'),
  // Met eigen tekst, anders lekt de Engelse standaardmelding van zod naar het
  // scherm. De route geeft de eerste melding letterlijk door aan de bezoeker.
  email: z.email('Vul een geldig e-mailadres in.'),
  herinnering: z.string().refine(
    herinneringGeldig,
    `Schrijf een paar zinnen, minstens ${HERINNERING_MIN_WOORDEN} woorden en hoogstens ${HERINNERING_MAX} tekens.`,
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

  /**
   * Alleen multipart. JSON gaat er niet meer in.
   *
   * WAAROM DIT GEEN WILLEKEURIGE BEPERKING IS
   * Astro weigert formuliergecodeerde en multipart-verzoeken van een andere
   * site, en die controle sloeg bij het testen ook echt aan. Op een
   * JSON-verzoek geldt hij niet, en dat was precies het gat: in de eerste
   * twintig uur dat deze route live stond kwamen er acht botinzendingen
   * binnen, alle acht als JSON en dus langs die controle heen.
   *
   * De pagina stuurt al multipart, want de foto moet mee. Dit pad sluiten kost
   * dus niets aan de bezoeker en zet de deur dicht voor wie het adres
   * rechtstreeks aanroept.
   */
  if (!isMultipartPost(request)) {
    const contentType = request.headers.get('content-type') || '';
    console.warn('[herinnering] Verzoek zonder multipart geweigerd:', contentType.slice(0, 40));
    return fout('Stuur je inzending via het formulier op de site.', 415);
  }

  let body;
  let foto: File | null = null;
  try {
    const fd = await request.formData();
    const kies = (naam: string) => {
      const v = fd.get(naam);
      return typeof v === 'string' ? v : undefined;
    };
    body = Schema.parse({
      naam: kies('naam') ?? '',
      email: kies('email') ?? '',
      herinnering: kies('herinnering') ?? '',
      // Een niet-aangevinkt vakje zit niet in de FormData, dus dit is exact
      // "heeft hij hem aangeklikt".
      nieuwsbrief: fd.get('nieuwsbrief') === '1',
      magArchief: fd.get('magArchief') === '1',
      magNaam: fd.get('magNaam') === '1',
      bedrijf: kies('bedrijf'),
    });
    const bestand = fd.get('foto');
    if (bestand instanceof File && bestand.size > 0) foto = bestand;
  } catch (err) {
    const eerste = (err as { issues?: { message: string }[] })?.issues?.[0]?.message;
    return fout(eerste || 'Controleer de velden en probeer opnieuw.');
  }

  // De foto vóór het nummer keuren. Anders verbruikt een afgekeurde inzending
  // een nummer uit de reeks en houdt de teller een gat over.
  if (foto) {
    const oordeel = keurFoto(foto.type, foto.size);
    if (oordeel !== 'geen') return fout(FOTO_MELDING[oordeel]);
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

  /**
   * De rij vóór de foto.
   *
   * Andersom stond de foto eerst in de bucket, en dat liet een weesbestand
   * achter zodra de rij daarna afketste op de unieke index (iemand die al
   * meedeed). Zo'n bestand hoort bij niemand: er is geen rij, dus ook geen
   * toestemmingsverklaring, en het beheerscherm kent geen verwijderknop om het
   * eruit te halen. Nu bestaat de rij eerst en hangt elk bestand aan een
   * inzending die erbij hoort.
   *
   * Het foto-veld wordt daarna bijgewerkt. Mislukt het uploaden, dan blijft de
   * inzending staan zonder foto en zegt het antwoord dat erbij.
   */
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

  /**
   * Nu pas de foto, en `upsert: false`.
   *
   * Met `upsert: true` zou een tweede bestand op hetzelfde nummer het eerste
   * stil overschrijven. Dat kan alleen als de nummerreeks iets herhaalt, en dan
   * wil je dat weten in plaats van er een inzending door kwijt te raken.
   */
  let pad: string | null = null;
  let fotoMislukt = false;
  if (foto) {
    const doel = fotoPad(nummer!, foto.type);
    if (!doel) {
      fotoMislukt = true;
    } else {
      const { error: opslagFout } = await sb.storage
        .from('herinneringen')
        .upload(doel, foto, { contentType: foto.type, upsert: false });
      if (opslagFout) {
        console.error('[herinnering] Foto opslaan mislukte voor', nummer, ':', opslagFout.message);
        fotoMislukt = true;
      } else {
        pad = doel;
        const { error: bijwerkFout } = await sb
          .from('herinneringen')
          .update({ foto_pad: pad, foto_type: foto.type, foto_bytes: foto.size })
          .eq('nummer', nummer);
        if (bijwerkFout) {
          // Het bestand staat er, de verwijzing niet. Dat is een weesbestand en
          // dat hoort in het log, want het beheerscherm toont hem dan niet.
          console.error('[herinnering] Fotoverwijzing bijwerken mislukte voor', nummer, ':', bijwerkFout.message);
          pad = null;
          fotoMislukt = true;
        }
      }
    }
  }

  /**
   * Bevestiging met het nummer erin. Mislukt dit, dan staat de inzending er wel
   * en weet de deelnemer zijn nummer niet, dus dat melden we eerlijk.
   *
   * De rem staat hier ná het vastleggen, net als bij de nieuwsbrief. De
   * inzending telt altijd mee; alleen de mail wacht als er te veel per uur
   * uitgaan.
   */
  const magMailen = await magInzendbevestigingVersturen(sb);
  const mail = renderHerinneringOntvangen(body.naam, nummer!, ACTIE.fotoAdres, !!pad);
  const { vastgelegd } = magMailen
    ? await zetInWachtrij({
        soort: 'herinnering-ontvangen',
        ontvanger: email,
        onderwerp: mail.subject,
        html: mail.html,
        dedupeSleutel: `herinnering:${nummer}`,
      })
    : { vastgelegd: false };

  await meldAanVoorNieuwsbrief(sb, email, body.nieuwsbrief);

  return new Response(JSON.stringify({
    success: true,
    nummer,
    fotoAdres: ACTIE.fotoAdres,
    fotoOntvangen: !!pad,
    // Alleen waar als er een foto was die niet opgeslagen kon worden. De
    // deelnemer moet dat weten, anders denkt hij dat hij volledig meedoet.
    fotoMislukt,
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

  /**
   * Eerst vastleggen, dan pas de rem.
   *
   * Hier stond de remcontrole vóór deze upsert, en dat wierp bij een volle
   * teller de hele aanmelding weg in plaats van alleen de mail. Precies
   * omgekeerd aan wat `aanmeldrem.ts` belooft, en het raakt de maat waarop
   * gestuurd wordt: één drukke dag en je verliest inschrijvingen zonder dat er
   * iets over gemeld wordt. De route bij het gewone formulier deed het al goed;
   * deze liep uit de pas.
   */
  const { error } = await sb.from('newsletter_subscribers').upsert({
    email,
    source: 'herinnering',
    confirmed: false,
  }, { onConflict: 'email' });

  if (error) {
    console.error('[herinnering] Nieuwsbriefaanmelding mislukte:', error.message);
    return;
  }

  // Nu pas de rem: de aanmelding staat vast, alleen de mail wacht.
  if (!(await magBevestigingVersturen(sb))) {
    console.error('[herinnering] Bovengrens bereikt; aanmelding vastgelegd, bevestigingsmail niet verstuurd voor:', email);
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
