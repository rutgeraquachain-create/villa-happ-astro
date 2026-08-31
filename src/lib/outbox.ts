/**
 * Villa Happ — mail-outbox (server-only)
 *
 * Waarom dit bestaat: de orderbevestiging vertrok rechtstreeks vanuit de
 * Mollie-webhook met een `.catch(console.error)`. Was Resend even
 * onbereikbaar, dan was die mail definitief weg. De webhook had Mollie al
 * 200 teruggegeven, dus die probeerde het niet opnieuw, en de klant kreeg
 * nooit een bevestiging van een bestelling die hij wél betaald had.
 *
 * Nu gaat elke mail eerst de wachtrij in en pas daarna de deur uit:
 *
 *   1. `zetInWachtrij()` schrijft de mail weg. Lukt dat, dan is de mail
 *      veilig, ook als de rest van de request omvalt.
 *   2. Direct daarna proberen we hem te versturen (snelle route), zodat een
 *      klant niet op een cron hoeft te wachten.
 *   3. Mislukt dat, dan blijft hij staan met oplopende backoff. De
 *      dagelijkse cron (/api/notify/run) leegt de wachtrij alsnog, en in
 *      het beheerportaal zit een knop om er niet op te hoeven wachten.
 *
 * Een outbox zonder backoff is een stille datavernietiger; die les komt uit
 * prWize Core, net als het atomair claimen met SKIP LOCKED zodat twee
 * gelijktijdige runs nooit dezelfde mail dubbel versturen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { verstuurDirect, isMailConfigured } from './mail';

/** Minuten tot de volgende poging, per poging. Daarna opgeven. */
const BACKOFF_MINUTEN = [1, 5, 15, 60, 180, 720];
const MAX_POGINGEN = BACKOFF_MINUTEN.length;

/**
 * Ruim binnen de serverless-limiet. Die is 30 seconden op Vercel Hobby, dus
 * de 40 seconden die hier eerst stonden pasten er niet in: het platform kapte
 * de functie af vóór het budget op was, en de rijen die dan nog geclaimd
 * stonden bleven liggen tot de volgende run ze als verweesd terugpakte.
 *
 * 15 seconden past ook naast het voorraadwerk dat in dezelfde aanroep draait
 * (/api/notify/run doet eerst de outbox, dan de meldingen). Een batch van 20
 * mails kost bij Resend ongeveer een halve seconde per stuk, dus dit is geen
 * praktische rem — het is de bodem onder het opruimwerk.
 */
const TIJDSBUDGET_MS = 15_000;
const BATCH = 20;

export interface WachtrijMail {
  soort: string;
  ontvanger: string;
  onderwerp: string;
  html: string;
  replyTo?: string;
  /**
   * Voorkomt dubbele mail als dezelfde gebeurtenis opnieuw langskomt,
   * bijvoorbeeld een webhook die Mollie twee keer aanroept.
   */
  dedupeSleutel?: string;
}

/**
 * Zet een mail in de wachtrij en probeer hem meteen te versturen.
 * Geeft terug of de mail veilig is vastgelegd, niet of hij al verstuurd is:
 * dat onderscheid is precies het punt van een outbox.
 */
export async function zetInWachtrij(mail: WachtrijMail): Promise<{ vastgelegd: boolean; verzonden: boolean }> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    console.warn('[outbox] Geen database; mail niet vastgelegd:', mail.soort, mail.ontvanger);
    return { vastgelegd: false, verzonden: false };
  }

  const { data, error } = await sb
    .from('uitgaande_mail')
    .insert({
      soort: mail.soort,
      ontvanger: mail.ontvanger,
      onderwerp: mail.onderwerp,
      html: mail.html,
      reply_to: mail.replyTo ?? null,
      dedupe_sleutel: mail.dedupeSleutel ?? null,
    })
    .select('id')
    .single();

  if (error) {
    // Unieke dedupe-sleutel: deze mail stond er al. Dat is geen fout.
    if (error.code === '23505') return { vastgelegd: true, verzonden: false };
    console.error('[outbox] Vastleggen mislukte:', error.message);
    return { vastgelegd: false, verzonden: false };
  }

  const verzonden = await probeerEen(sb, data.id, mail.ontvanger, mail.onderwerp, mail.html, mail.replyTo, 0);
  return { vastgelegd: true, verzonden };
}

/** Eén mail versturen en het resultaat wegschrijven. */
async function probeerEen(
  sb: SupabaseClient,
  id: string,
  ontvanger: string,
  onderwerp: string,
  html: string,
  replyTo: string | null | undefined,
  pogingenTotNu: number,
): Promise<boolean> {
  if (!isMailConfigured()) {
    // Geen mailkanaal: laat de rij staan, markeer niets. Zo gaat er geen
    // mail verloren zodra de sleutel er wel is.
    return false;
  }

  let fout: string | null = null;
  let gelukt = false;
  let providerId: string | undefined;
  try {
    const uitslag = await verstuurDirect(ontvanger, onderwerp, html, replyTo ?? undefined);
    gelukt = uitslag.ok;
    providerId = uitslag.id;
    if (!gelukt) fout = uitslag.fout || 'Resend gaf geen bevestiging';
  } catch (err) {
    fout = err instanceof Error ? err.message : String(err);
  }

  if (gelukt) {
    await sb
      .from('uitgaande_mail')
      .update({
        status: 'verzonden',
        verzonden_op: new Date().toISOString(),
        geclaimd_op: null,
        // LET OP het verschil tussen deze twee kolommen. `status` zegt dat de
        // mail de deur uit is; `aflevering` zegt wat de ontvangende server
        // ermee deed. Hier zetten we alleen de eerste, plus de koppelsleutel
        // waarmee de webhook straks de tweede invult. Ze hier allebei op
        // "goed" zetten is precies de fout die zes dagen zoeken kostte bij
        // VH-2026-00001.
        provider_id: providerId ?? null,
        aflevering: 'verstuurd',
      })
      .eq('id', id);
    return true;
  }

  const pogingen = pogingenTotNu + 1;
  const opgegeven = pogingen >= MAX_POGINGEN;
  const wachtMin = BACKOFF_MINUTEN[Math.min(pogingen, BACKOFF_MINUTEN.length - 1)];

  await sb
    .from('uitgaande_mail')
    .update({
      status: opgegeven ? 'opgegeven' : 'wacht',
      pogingen,
      laatste_fout: (fout || 'onbekend').slice(0, 500),
      geclaimd_op: null,
      // Volgende poging op basis van de klok hier; de selectie vergelijkt met
      // de databaseklok, dus we zetten hem ruim genoeg.
      volgende_poging_op: new Date(Date.now() + wachtMin * 60_000).toISOString(),
    })
    .eq('id', id);

  if (opgegeven) {
    console.error('[outbox] Mail definitief opgegeven na', pogingen, 'pogingen:', ontvanger, onderwerp);
  }
  return false;
}

export interface OutboxUitslag {
  verzonden: number;
  mislukt: number;
  /** Wachtend vóór deze run; achteraf meten wist het bewijs van een uitval uit. */
  wachtendVooraf: number;
  oudsteSecondenVooraf: number;
  opgegeven: number;
  /**
   * Mail die wél de deur uit ging en aantoonbaar niet is aangekomen: gebounced
   * of als spam gemarkeerd. Staat los van `mislukt`, want dat telt alleen
   * mislukte verzendpogingen. Dit onderscheid bestaat sinds de webhook er is;
   * daarvoor was zulke mail onzichtbaar en telde hij mee als geslaagd.
   */
  nietAfgeleverd: number;
}

/** Verwerkt de wachtrij. Aangeroepen door de cron en door het beheerportaal. */
export async function verwerkWachtrij(): Promise<OutboxUitslag> {
  const start = Date.now();
  const leeg: OutboxUitslag = {
    verzonden: 0, mislukt: 0, wachtendVooraf: 0, oudsteSecondenVooraf: 0,
    opgegeven: 0, nietAfgeleverd: 0,
  };

  const sb = getSupabaseAdmin();
  if (!sb) return leeg;

  // METEN VOOR HET VERWERKEN. Meet je achteraf, dan stuurt deze run zijn
  // eigen achterstand weg en meldt hij keurig nul terwijl er uren niets ging.
  const achterstand = await leesAchterstand(sb);

  const { data: batch, error } = await sb.rpc('claim_outbox_batch', { p_limiet: BATCH });
  if (error || !batch) return { ...leeg, ...achterstand };

  let verzonden = 0;
  let mislukt = 0;
  for (const rij of batch as any[]) {
    if (Date.now() - start > TIJDSBUDGET_MS) {
      // Tijd op: claim teruggeven zodat de volgende run hem oppakt.
      await sb.from('uitgaande_mail').update({ status: 'wacht', geclaimd_op: null }).eq('id', rij.id);
      continue;
    }
    const ok = await probeerEen(sb, rij.id, rij.ontvanger, rij.onderwerp, rij.html, rij.reply_to, rij.pogingen);
    ok ? verzonden++ : mislukt++;
  }

  return { verzonden, mislukt, ...achterstand };
}

async function leesAchterstand(sb: SupabaseClient) {
  const { data } = await sb.rpc('outbox_achterstand');
  const rij = Array.isArray(data) ? data[0] : data;
  return {
    wachtendVooraf: Number(rij?.wachtend ?? 0),
    oudsteSecondenVooraf: Number(rij?.oudste_seconden ?? 0),
    opgegeven: Number(rij?.opgegeven ?? 0),
    nietAfgeleverd: Number(rij?.niet_afgeleverd ?? 0),
  };
}

/** Status voor het beheerportaal, zonder iets te verwerken. */
export async function wachtrijStatus() {
  const sb = getSupabaseAdmin();
  if (!sb) return { wachtendVooraf: 0, oudsteSecondenVooraf: 0, opgegeven: 0, nietAfgeleverd: 0 };
  return leesAchterstand(sb);
}
