/**
 * Villa Happ — de campagnestand in één regel
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Op 9 september 2026 zijn er vijf defecten gevonden die één vorm deelden: geen
 * foutmelding, geen rode toets, alleen iets dat niet gebeurde. Een
 * bevestigingsmail die op een sleutelbotsing verdween terwijl het antwoord
 * "verstuurd" meldde. Metingen die de eigen CSP tegenhield. Een honeypot op een
 * veld dat niet bestond. Twee pagina's zonder stijlblad. Knoppen die geen kliks
 * vingen.
 *
 * Zulke defecten hebben geen alarm nodig maar een teller die een mens ziet. De
 * regel eronder: de verzendkant mag zichzelf niet geslaagd verklaren. Een mail
 * telt pas als afgeleverd wanneer de Resend-webhook dat zegt, niet wanneer de
 * wachtrij hem heeft aangenomen. Zie de scheiding tussen `status` en
 * `aflevering` in `uitgaande_mail`.
 *
 * WAT JE ERAAN AFLEEST
 * --------------------
 * Loopt `afgeleverd` niet mee met `ingezonden`, dan is er iets stil kapot. Dat
 * is de hele monitoring, en hij past op één regel in het beheerscherm.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** De mailsoorten die bij deze campagne horen. */
export const CAMPAGNE_SOORTEN = ['herinnering-ontvangen', 'nieuwsbrief-bevestiging'] as const;

/**
 * Middernacht in Nederland, uitgedrukt als moment.
 *
 * Niet `new Date().setHours(0,0,0,0)`: dat rekent in de tijdzone van de server,
 * en die staat op Vercel op UTC. In oktober scheelt dat twee uur, dus tussen
 * 00:00 en 02:00 Nederlandse tijd zou "vandaag" de vorige dag zijn. Precies het
 * uur waarop iemand na een avondpost gaat kijken hoe het loopt.
 *
 * De omschakeling naar wintertijd valt op 25 oktober 2026, ná deze campagne.
 * Op die ene dag is de uitkomst een uur naast; dat is bewust niet opgelost.
 */
export function beginVanDagNL(nu: Date = new Date()): Date {
  const klok = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(nu);
  const [uur, minuut, seconde] = klok.split(':').map(Number);
  const sindsMiddernacht = ((uur * 60 + minuut) * 60 + seconde) * 1000 + nu.getMilliseconds();
  return new Date(nu.getTime() - sindsMiddernacht);
}

export interface CampagneStand {
  /** Inzendingen voor de herinneringsactie. */
  ingezonden: number;
  /** Nieuwsbriefrijen die zijn aangemaakt. Nog geen toestemming. */
  aangemeld: number;
  /** Rijen met `confirmed`. Dit is de maat waarop gestuurd wordt. */
  bevestigd: number;
  /** Campagnemail die de deur uit ging volgens de wachtrij. */
  verstuurd: number;
  /** Campagnemail die volgens de Resend-webhook is aangekomen. */
  afgeleverd: number;
  /**
   * Verstuurde campagnemail waar de webhook nog niets over zei.
   *
   * Een paar minuten is normaal: de webhook loopt achter op het versturen. Blijft
   * dit getal staan terwijl `verstuurd` oploopt, dan komt er niets terug van
   * Resend en weet je van geen enkele mail of hij aankwam.
   */
  zonderStempel: number;
}

const LEEG: CampagneStand = {
  ingezonden: 0, aangemeld: 0, bevestigd: 0, verstuurd: 0, afgeleverd: 0, zonderStempel: 0,
};

/** Eén telling. Geeft `null` terug als de telling zelf faalde. */
async function tel(
  sb: SupabaseClient,
  tabel: string,
  bouw: (q: any) => any,
): Promise<number | null> {
  const { count, error } = await bouw(sb.from(tabel).select('id', { count: 'exact', head: true }));
  if (error) {
    console.error(`[campagnestand] Tellen mislukte op ${tabel}:`, error.message);
    return null;
  }
  return count ?? 0;
}

/**
 * De stand sinds een moment.
 *
 * FAALT EEN TELLING, DAN IS DE UITKOMST ONBEKEND EN NIET NUL.
 * Een nul op het scherm leest als "er is niets gebeurd", en dat is precies de
 * verkeerde conclusie wanneer de database niet antwoordde. Vandaar dat dit
 * `null` teruggeeft zodra één telling faalt, en het scherm dan zegt dat de stand
 * niet te lezen was.
 */
export async function leesCampagneStand(
  sb: SupabaseClient,
  vanaf: Date,
): Promise<CampagneStand | null> {
  const sinds = vanaf.toISOString();
  const soorten = [...CAMPAGNE_SOORTEN];

  const [ingezonden, aangemeld, bevestigd, verstuurd, afgeleverd, zonderStempel] = await Promise.all([
    tel(sb, 'herinneringen', (q) => q.gte('created_at', sinds)),
    tel(sb, 'newsletter_subscribers', (q) => q.gte('created_at', sinds)),
    tel(sb, 'newsletter_subscribers', (q) => q.gte('created_at', sinds).eq('confirmed', true)),
    tel(sb, 'uitgaande_mail', (q) =>
      q.gte('created_at', sinds).in('soort', soorten).eq('status', 'verzonden')),
    tel(sb, 'uitgaande_mail', (q) =>
      q.gte('created_at', sinds).in('soort', soorten).eq('aflevering', 'afgeleverd')),
    tel(sb, 'uitgaande_mail', (q) =>
      q.gte('created_at', sinds).in('soort', soorten).eq('status', 'verzonden')
        .in('aflevering', ['onbekend', 'verstuurd'])),
  ]);

  const alle = [ingezonden, aangemeld, bevestigd, verstuurd, afgeleverd, zonderStempel];
  if (alle.some((n) => n === null)) return null;

  return {
    ...LEEG,
    ingezonden: ingezonden!,
    aangemeld: aangemeld!,
    bevestigd: bevestigd!,
    verstuurd: verstuurd!,
    afgeleverd: afgeleverd!,
    zonderStempel: zonderStempel!,
  };
}

/**
 * Verdient deze stand aandacht van een mens?
 *
 * Twee gevallen, en allebei zijn ze de stille vorm:
 *  - er is ingezonden en er is niets afgeleverd (de bevestiging komt niet aan);
 *  - er is aangemeld en niets bevestigd (de dubbele opt-in loopt niet rond).
 *
 * Bewust geen drempel op percentages. Bij deze aantallen is één inzending zonder
 * afgeleverde mail al het signaal, en een percentage over drie rijen is ruis.
 */
export function vraagtAandacht(stand: CampagneStand): boolean {
  if (stand.ingezonden > 0 && stand.afgeleverd === 0) return true;
  if (stand.aangemeld > 0 && stand.bevestigd === 0) return true;
  return false;
}
