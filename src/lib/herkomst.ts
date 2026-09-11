/**
 * Villa Happ — waar een bezoeker vandaan kwam
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Tot 11 september 2026 legde Villa Happ nergens vast via welk kanaal een
 * bestelling, een aanmelding of een herinnering binnenkwam. GA4 wist het per
 * bezoek, maar GA4 kent geen bestelnummer en geen aanmelding die later wel of
 * niet bevestigd werd. De vraag "wat leverde LinkedIn op" was daarmee niet te
 * beantwoorden, en elke inzending van vóór deze module blijft voorgoed onbekend:
 * herkomst is achteraf niet terug te halen.
 *
 * WAT ER VAN EEN ANDERE WINKEL IS OVERGENOMEN
 * -------------------------------------------
 * De classificatie hieronder volgt tak voor tak een classificatie die in een
 * ander project al twee jaar aanvragen indeelt, en de belangrijkste les daaruit
 * staat in `ingang`: meet de herkomst bij het BEGIN van het bezoek, niet bij het
 * versturen. Wie eerst rondkijkt en daarna pas invult, heeft als verwijzer de
 * eigen site, en dan is de echte bron weg. Daar bleek bij meting het grootste
 * deel van de "onbekende" aanvragen uit te bestaan.
 *
 * Wat NIET is overgenomen: de keten die daar aanvragen aan klanten koppelt op
 * bedrijfsnaam, tijdvensters en handmatige correcties. Die compenseert voor
 * systemen zonder gedeelde sleutel. Hier schrijven we de rij zelf, dus de
 * herkomst gaat er op het moment zelf in en er valt niets te koppelen.
 *
 * TWEE HELFTEN
 * ------------
 * - `classificeer()` en `schoneHerkomst()` draaien op de server. De server
 *   vertrouwt niets van wat de browser meestuurt: dit veld is door een bezoeker
 *   in te vullen, en een bot zette in september zijn eigen waarde in het veld
 *   `source`, waarna de eerste analyse naar het verkeerde kanaal wees.
 * - `herkomst-client.ts` draait in de browser en legt de ingang vast.
 */

/** Het kanaal zoals het in de database en in rapportages staat. */
export type Kanaal =
  | 'ADS'
  | 'OFFLINE'
  | 'AI_ASSISTENT'
  | 'CAMPAGNE'
  | 'DIRECT'
  | 'ONBEKEND'
  | 'ORGANISCH'
  | 'VERWIJZING';

/**
 * Versie van de CLASSIFICATIEREGELS.
 *
 * Staat op elke rij naast het kanaal. Verhoog hem zodra dezelfde invoer een
 * ander kanaal kan opleveren, ook bij een toevoeging aan een van de hostlijsten
 * hieronder: die lijsten ZIJN de regel. Zonder dit nummer is een tabel waarin
 * de ene helft door de oude regel ging en de andere door de nieuwe, niet te
 * onderscheiden van een tabel die helemaal om is.
 */
export const HERKOMST_VERSIE = 1;

/** Wat de browser meestuurt, na opschonen. Alles optioneel, alles kort. */
export interface Herkomst {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** Google Ads-klik-id: gclid, of gbraid/wbraid bij verkeer zonder cookie. */
  klik_id?: string;
  /** Alleen de HOST van de verwijzer, nooit de volledige url. Zie `schoneHost`. */
  verwijzer?: string;
  /** Pad van de eerste pagina van het bezoek, zonder querystring. */
  ingang?: string;
  /** De bron van dit record: de ingang van het bezoek, of alleen deze pagina. */
  meting?: 'ingang' | 'pagina';
}

const ZOEKMACHINE_HOSTS = [
  'google.com', 'google.nl', 'bing.com', 'yahoo.com', 'duckduckgo.com',
  'ecosia.org', 'startpagina.nl', 'qwant.com', 'search.brave.com',
];
const ZOEKMACHINE_NAMEN = ['google', 'bing', 'yahoo', 'duckduckgo', 'ecosia', 'startpagina', 'qwant', 'brave'];

const AI_HOSTS = [
  'chatgpt.com', 'chat.openai.com', 'openai.com', 'perplexity.ai', 'claude.ai',
  'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com', 'you.com', 'poe.com', 'phind.com',
];
/**
 * Kale merknamen zonder domein. Nodig omdat `utm_source` in de praktijk even
 * vaak `chatgpt` is als `chatgpt.com`; alleen op host matchen laat die in de
 * campagne-emmer vallen. Alleen bij een EXACTE match: een campagne die
 * "claude-actie" heet is een campagne.
 */
const AI_NAMEN = ['chatgpt', 'openai', 'perplexity', 'claude', 'gemini', 'copilot', 'bard', 'poe', 'phind'];

/**
 * De eigen site. Een verwijzer hiervandaan zegt niets over de herkomst: de
 * bezoeker klikte door en de browser overschreef de oorspronkelijke verwijzer.
 * Hier een lijst en geen vergelijking met de landingspagina, omdat de server
 * alleen de host van de verwijzer ontvangt en niet de volledige url.
 */
const EIGEN_HOSTS = ['villahapp.nl', 'villa-happ.nl', 'villa-happ-astro.vercel.app'];

const eindigtOp = (host: string, lijst: readonly string[]) =>
  lijst.some((d) => host === d || host.endsWith('.' + d));

function isAi(waarde: string): boolean {
  const h = waarde.toLowerCase().replace(/^www\./, '');
  if (!h) return false;
  return eindigtOp(h, AI_HOSTS) || AI_NAMEN.includes(h);
}

/** Google draait op tientallen landdomeinen; een lijst mist er altijd een. */
function isZoekmachine(host: string): boolean {
  if (!host) return false;
  if (host.startsWith('google.') || host.includes('.google.')) return true;
  return eindigtOp(host, ZOEKMACHINE_HOSTS) || ZOEKMACHINE_NAMEN.includes(host);
}

/**
 * Het kanaal, in deze volgorde:
 * betaald, offline, AI-assistent, een expliciete utm-bron, geen verwijzer
 * (direct), de eigen site als verwijzer (onbekend), een zoekmachine
 * (organisch), en anders een echte verwijzing.
 *
 * De volgorde is de regel. AI staat vóór de utm-bron omdat een assistent in
 * beide vormen verschijnt; stond hij erachter, dan viel de helft van dat kanaal
 * als campagne weg.
 */
export function classificeer(h: Herkomst): Kanaal {
  // Underscores naar spaties: `\b` telt `_` als woordteken, dus zonder dit
  // matcht `paid` niet in `paid_social` en `offline` niet in `offline_qr`.
  const medium = (h.utm_medium || '').replace(/_/g, ' ');

  if (h.klik_id || /\b(cpc|ppc|paid|paidsearch)\b/i.test(medium)) return 'ADS';
  if (/\b(offline|qr|print|flyer|beurs)\b/i.test(medium)) return 'OFFLINE';
  if (isAi(h.utm_source || '') || isAi(h.verwijzer || '')) return 'AI_ASSISTENT';
  if (h.utm_source) return 'CAMPAGNE';
  if (!h.verwijzer) return 'DIRECT';
  if (eindigtOp(h.verwijzer, EIGEN_HOSTS)) return 'ONBEKEND';
  if (isZoekmachine(h.verwijzer)) return 'ORGANISCH';
  return 'VERWIJZING';
}

/* ------------------------------------------------------------------------ */
/* Opschonen op de server                                                   */
/* ------------------------------------------------------------------------ */

/** Hoe lang het hele veld mag zijn voordat we het niet eens proberen. */
const MAX_RUW = 2000;

/**
 * Een utm-waarde. Kort, zonder stuurtekens, en zonder iets wat op een
 * e-mailadres lijkt: een campagne die per ongeluk `utm_content=jan@...` meegeeft
 * zou anders persoonsgegevens in een marketingkolom zetten.
 */
function schoneTekst(waarde: unknown, max = 100): string | undefined {
  if (typeof waarde !== 'string') return undefined;
  const t = waarde.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  if (!t || t.includes('@')) return undefined;
  return t;
}

/** Een hostnaam, en niets anders. Een volledige url wordt teruggebracht tot zijn host. */
function schoneHost(waarde: unknown): string | undefined {
  if (typeof waarde !== 'string' || !waarde) return undefined;
  let host = waarde.trim().toLowerCase();
  try {
    if (host.includes('/')) host = new URL(host).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/^www\./, '');
  return /^[a-z0-9.-]{1,253}$/.test(host) && host.includes('.') ? host : undefined;
}

/** Een pad op de eigen site. Geen querystring: daar kan van alles in staan. */
function schoonPad(waarde: unknown): string | undefined {
  if (typeof waarde !== 'string' || !waarde.startsWith('/')) return undefined;
  const pad = waarde.split(/[?#]/)[0].slice(0, 200);
  return /^\/[A-Za-z0-9\-._~/%]*$/.test(pad) ? pad : undefined;
}

/**
 * Wat de browser meestuurt, teruggebracht tot wat we willen bewaren.
 *
 * Tolerant: onbekende sleutels, verkeerde typen en te lange waarden vallen
 * weg in plaats van de hele aanvraag te laten falen. Een aanmelding zonder
 * herkomst is een aanmelding; een aanmelding die om een meetveld sneuvelt is
 * een verloren aanmelding.
 */
export function schoneHerkomst(ruw: unknown): Herkomst {
  let data: Record<string, unknown> = {};
  if (typeof ruw === 'string') {
    if (!ruw || ruw.length > MAX_RUW) return {};
    try {
      const geparsed = JSON.parse(ruw);
      if (geparsed && typeof geparsed === 'object' && !Array.isArray(geparsed)) data = geparsed;
    } catch {
      return {};
    }
  } else if (ruw && typeof ruw === 'object' && !Array.isArray(ruw)) {
    data = ruw as Record<string, unknown>;
  }

  const uit: Herkomst = {};
  for (const sleutel of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
    const v = schoneTekst(data[sleutel]);
    if (v) uit[sleutel] = v;
  }
  const klik = typeof data.klik_id === 'string' ? data.klik_id.trim() : '';
  if (/^[A-Za-z0-9_-]{10,200}$/.test(klik)) uit.klik_id = klik;
  const verwijzer = schoneHost(data.verwijzer);
  if (verwijzer) uit.verwijzer = verwijzer;
  const ingang = schoonPad(data.ingang);
  if (ingang) uit.ingang = ingang;
  if (data.meting === 'ingang' || data.meting === 'pagina') uit.meting = data.meting;
  return uit;
}

/**
 * De kolommen voor een rij, klaar om mee te schrijven.
 *
 * Een lege herkomst geeft ook een kanaal: DIRECT. Dat klopt voor een bezoeker
 * zonder verwijzer, maar het is ook wat je krijgt als JavaScript niet draaide.
 * `meting` in de JSON zegt welke van de twee het is: ontbreekt hij, dan heeft
 * de browser niets meegestuurd en is DIRECT een ondergrens.
 */
export function herkomstKolommen(ruw: unknown): { herkomst: Herkomst & { versie: number }; herkomst_kanaal: Kanaal } {
  const h = schoneHerkomst(ruw);
  return { herkomst: { ...h, versie: HERKOMST_VERSIE }, herkomst_kanaal: classificeer(h) };
}

/**
 * De herkomstkolommen voor een nieuwsbriefrij, maar alleen als die er nog geen heeft.
 *
 * DE EERSTE AANRAKING WINT. Een adres kan op vier plekken op de lijst komen
 * (voettekst, homepage, herinnering, kassa), en elk daarvan doet een upsert op
 * het e-mailadres. Zou elke upsert zijn eigen herkomst meesturen, dan
 * overschrijft de tweede aanmelding stil waar iemand oorspronkelijk vandaan
 * kwam, en dan meet de kolom de laatste klik in plaats van de eerste. Een upsert
 * laat een kolom die hij niet noemt ongemoeid, dus een leeg object hier is
 * genoeg om de oude waarde te bewaren.
 */
export function herkomstVoorNieuwsbrief(
  bestaand: { herkomst_kanaal?: string | null } | null | undefined,
  ruw: unknown,
): Partial<ReturnType<typeof herkomstKolommen>> {
  return bestaand?.herkomst_kanaal ? {} : herkomstKolommen(ruw);
}
