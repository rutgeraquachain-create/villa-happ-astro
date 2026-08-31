/**
 * Villa Happ — Resend-webhook: handtekening en duiding (server-only)
 *
 * WAAROM DIT BESTAAT. `uitgaande_mail.status` ging op 'verzonden' zodra Resend
 * de POST met 200 beantwoordde. Dat betekent "aangenomen", niet "aangekomen".
 * Bij bestelling VH-2026-00001 stond de winkeliersmelding op 'verzonden' met
 * nul pogingen en geen fout, terwijl Rutger hem nooit zag. Het systeem kon die
 * twee dingen niet uit elkaar houden en meldde het gunstigste.
 *
 * Resend stuurt na het versturen gebeurtenissen. Die vertellen wat de
 * ontvangende server deed. Dit bestand bevat de pure functies daaromheen, los
 * van database en HTTP, zodat ze te testen zijn zonder netwerk.
 *
 * De handtekening volgt het Svix-schema, dat Resend gebruikt:
 *
 *   ondertekend = `${svix-id}.${svix-timestamp}.${ruwe body}`
 *   handtekening = base64( HMAC-SHA256( sleutel, ondertekend ) )
 *
 * De sleutel staat als `whsec_<base64>` in de omgeving. Het deel achter het
 * voorvoegsel is base64 en moet gedecodeerd worden tot bytes; die bytes zijn
 * de HMAC-sleutel. Wie het voorvoegsel laat staan of de tekst rechtstreeks als
 * sleutel gebruikt, krijgt een handtekening die nooit klopt.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Speling op de tijdstempel. Zonder deze controle kan iemand een oud, geldig
 * ondertekend bericht eindeloos opnieuw aanbieden. Vijf minuten is wat Svix
 * zelf aanhoudt: ruim genoeg voor klokverschil, kort genoeg om herhaling
 * zinloos te maken.
 */
export const TIJDSPELING_SECONDEN = 5 * 60;

export type Verificatie = { ok: true } | { ok: false; reden: string };

export interface HandtekeningInvoer {
  /** De `whsec_...`-sleutel uit de omgeving. */
  geheim: string | undefined;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  /** De body exact zoals binnengekomen. Niet eerst door JSON.parse halen. */
  body: string;
  /** Nu, in seconden. Als parameter zodat een test niet van de klok afhangt. */
  nuSeconden: number;
}

export function verifieerHandtekening(inv: HandtekeningInvoer): Verificatie {
  const { geheim, svixId, svixTimestamp, svixSignature, body, nuSeconden } = inv;

  if (!geheim) return { ok: false, reden: 'geen-geheim' };
  if (!svixId || !svixTimestamp || !svixSignature) return { ok: false, reden: 'kop-ontbreekt' };

  const tijd = Number(svixTimestamp);
  if (!Number.isFinite(tijd)) return { ok: false, reden: 'tijdstempel-ongeldig' };
  // Beide kanten op begrenzen. Alleen op "te oud" toetsen laat een bericht met
  // een tijdstempel ver in de toekomst eindeloos geldig blijven.
  if (Math.abs(nuSeconden - tijd) > TIJDSPELING_SECONDEN) {
    return { ok: false, reden: 'tijdstempel-buiten-venster' };
  }

  let sleutel: Buffer;
  try {
    sleutel = Buffer.from(geheim.replace(/^whsec_/, ''), 'base64');
  } catch {
    return { ok: false, reden: 'geheim-onleesbaar' };
  }
  if (sleutel.length === 0) return { ok: false, reden: 'geheim-onleesbaar' };

  const verwacht = createHmac('sha256', sleutel)
    .update(`${svixId}.${svixTimestamp}.${body}`)
    .digest();

  /**
   * De kop kan meerdere handtekeningen bevatten, gescheiden door spaties, elk
   * als `v1,<base64>`. Dat is hoe Svix een sleutelrotatie doet: tijdens het
   * omzetten tekent hij met oud én nieuw. Eén treffer is genoeg.
   */
  for (const deel of svixSignature.split(' ')) {
    const [versie, waarde] = deel.split(',');
    if (versie !== 'v1' || !waarde) continue;
    let gegeven: Buffer;
    try {
      gegeven = Buffer.from(waarde, 'base64');
    } catch {
      continue;
    }
    // timingSafeEqual gooit op ongelijke bytelengte in plaats van false terug
    // te geven. Diezelfde valkuil staat in order-token.ts; hier zou hij de
    // route met een 500 laten omvallen op een bericht dat gewoon niet klopt.
    if (gegeven.length === verwacht.length && timingSafeEqual(gegeven, verwacht)) {
      return { ok: true };
    }
  }
  return { ok: false, reden: 'handtekening-klopt-niet' };
}

/* ------------------------------------------------------------ duiding ---- */

export type Aflevering =
  | 'onbekend' | 'verstuurd' | 'vertraagd' | 'afgeleverd' | 'gebounced' | 'spamklacht';

/**
 * Ernstvolgorde. Webhooks komen niet gegarandeerd op volgorde binnen, en zonder
 * rangorde zou een `email.sent` die na `email.delivered` aankomt de stand
 * terugzetten naar het slechtere nieuws. Alleen opwaarts bijwerken.
 *
 * Een spamklacht staat boven aflevering: die kómt per definitie na de
 * aflevering en is het ergere feit. Een bounce staat er ook boven, want die
 * hoort niet ná een aflevering te komen; gebeurt het toch, dan wil je de
 * alarmerende stand zien en niet de geruststellende.
 */
export const AFLEVERING_RANG: Record<Aflevering, number> = {
  onbekend: 0, verstuurd: 1, vertraagd: 2, afgeleverd: 3, gebounced: 4, spamklacht: 5,
};

export interface Duiding {
  aflevering: Aflevering;
  /** Waar of niet: hier moet iemand iets mee. */
  alarm: boolean;
}

/**
 * Vertaalt een Resend-gebeurtenis naar onze stand.
 *
 * Opens en clicks staan er bewust niet in. Die vereisen een trackingpixel en
 * herschreven links, en dat is voor een webshop met een privacyverklaring een
 * losse afweging. Komen ze toch binnen, dan worden ze wel vastgelegd in
 * `mail_gebeurtenissen` maar veranderen ze de stand niet.
 *
 * `email.failed` is geen bounce van de ontvanger maar een mislukking bij Resend
 * zelf. We zetten hem op dezelfde stand, want het gevolg is hetzelfde: de mail
 * is niet aangekomen en er moet iemand naar kijken. Het onderscheid blijft
 * leesbaar in `soort` en `payload` van de gebeurtenis.
 */
export function duidGebeurtenis(soort: string): Duiding | null {
  switch (soort) {
    case 'email.sent':             return { aflevering: 'verstuurd',  alarm: false };
    case 'email.delivered':        return { aflevering: 'afgeleverd', alarm: false };
    case 'email.delivery_delayed': return { aflevering: 'vertraagd',  alarm: false };
    case 'email.bounced':          return { aflevering: 'gebounced',  alarm: true };
    case 'email.failed':           return { aflevering: 'gebounced',  alarm: true };
    case 'email.complained':       return { aflevering: 'spamklacht', alarm: true };
    default:                       return null;
  }
}

/** Mag `nieuw` de bestaande stand overschrijven? */
export function magBijwerken(huidig: string | null | undefined, nieuw: Aflevering): boolean {
  const oud = AFLEVERING_RANG[(huidig ?? 'onbekend') as Aflevering] ?? 0;
  return AFLEVERING_RANG[nieuw] > oud;
}

/**
 * Korte, leesbare reden uit het bericht van Resend.
 *
 * Bij een bounce zit hier de tekst van de ontvangende server, en dat is het
 * enige dat vertelt of het adres niet bestaat of dat de mail geweigerd werd.
 * De vorm verschilt per gebeurtenis, dus we proberen een paar plekken in plaats
 * van er één aan te nemen.
 */
export function leesDetail(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  const kandidaten = [
    data.bounce?.message, data.bounce?.subType, data.bounce?.type,
    data.reason, data.message, data.failed?.reason,
  ];
  for (const k of kandidaten) {
    if (typeof k === 'string' && k.trim()) return k.trim().slice(0, 500);
  }
  return null;
}

/** Eerste ontvanger uit het bericht. Resend levert `to` als string of array. */
export function leesOntvanger(data: any): string | null {
  const to = data?.to;
  if (typeof to === 'string') return to;
  if (Array.isArray(to) && typeof to[0] === 'string') return to[0];
  return null;
}
