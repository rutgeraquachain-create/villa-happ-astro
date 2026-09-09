/**
 * Villa Happ — de foto bij een herinnering
 *
 * Puur en zonder I/O, zodat de regels los van de opslag te toetsen zijn.
 *
 * WAT HIER BINNENKOMT
 * -------------------
 * Scans en telefoonfoto's van oude kiekjes, van mensen die geen idee hebben van
 * bestandsformaten. Dus: ruim in wat je accepteert, streng in wat je vertrouwt.
 *
 * De browser verkleint het beeld vóór verzending (zie herinnering.astro), dus in
 * de praktijk komt hier iets van een paar honderd kilobyte binnen. De grenzen
 * hieronder zijn de vangnetten voor wanneer dat verkleinen niet lukt of iemand
 * het endpoint rechtstreeks aanroept.
 */

/**
 * Wat we accepteren.
 *
 * HEIC staat er bewust niet bij, ook al maakt elke iPhone het. De browser zet
 * het bij het verkleinen om naar JPEG, dus wat hier aankomt is al omgezet. Zou
 * HEIC er wél in mogen, dan belandt er een bestand in de opslag dat het
 * beheerscherm niet kan tonen, en dan lijkt de inzending leeg.
 */
export const TOEGESTANE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Grens op de server.
 *
 * Vier megabyte, en dat getal komt van Vercel: een serverless-functie mag daar
 * een body van 4,5 MB ontvangen en kapt alles daarboven af met een rauwe 413.
 * Hier stond 5 MB, precies bóven die grens, waardoor elke foto tussen 4,5 en 5
 * MB een kale foutpagina kreeg in plaats van de melding uit `FOTO_MELDING`. De
 * multipart-omhulling telt ook mee, dus er zit bewust wat lucht tussen.
 *
 * De bucket weigert vanaf 5 MB; deze grens ligt eronder en geeft de nette
 * melding voordat het zover komt.
 */
export const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Waar de browser naartoe verkleint. 2000 px lange zijde is ruim genoeg om een
 * oude foto op schermformaat te tonen en klein genoeg om onder de
 * verzendlimiet van een serverless-verzoek te blijven.
 */
export const MAX_ZIJDE = 2000;

export type FotoFout = 'geen' | 'type' | 'groot' | 'leeg';

export function keurFoto(type: string, bytes: number): FotoFout {
  if (bytes <= 0) return 'leeg';
  if (!(TOEGESTANE_TYPES as readonly string[]).includes(type)) return 'type';
  if (bytes > MAX_BYTES) return 'groot';
  return 'geen';
}

/**
 * De grens zoals een bezoeker hem leest.
 *
 * Afgeleid uit `MAX_BYTES` en niet apart opgeschreven. Toen de grens op 7
 * september 2026 van 5 naar 4 MB ging omdat 5 boven de afkapgrens van Vercel
 * lag, bleef de melding op 5 MB staan. De code weigerde vanaf 4 MB en de tekst
 * beloofde 5, dus een foto van 4,5 MB kreeg een melding die zei dat hij mocht.
 * Eén bron, zodat een volgende verschuiving de tekst meeneemt.
 */
export const MAX_MB_TEKST = `${MAX_BYTES / (1024 * 1024)} MB`;

export const FOTO_MELDING: Record<Exclude<FotoFout, 'geen'>, string> = {
  type: 'Kies een foto als JPG, PNG of WebP.',
  groot: `Deze foto is te groot. Kies er een van maximaal ${MAX_MB_TEKST}.`,
  leeg: 'Dit bestand is leeg. Kies een andere foto.',
};

/** De extensie die bij het type hoort. Nooit die uit de bestandsnaam. */
const EXTENSIE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Het pad in de bucket.
 *
 * Opgebouwd uit het inzendnummer en niets anders. Bewust niet uit de naam die
 * de bezoeker meestuurt: die kan `../` bevatten, een dubbele extensie dragen, of
 * de naam van iemand anders zijn bestand zijn. Het nummer is van ons, uniek, en
 * legt de foto meteen vast aan de juiste inzending.
 */
export function fotoPad(nummer: string, type: string): string | null {
  const ext = EXTENSIE[type];
  if (!ext) return null;
  if (!/^HH-\d{4}-\d{4}$/.test(nummer)) return null;
  return `${nummer}.${ext}`;
}

/** Leesbare grootte voor het beheerscherm. */
export function leesbareGrootte(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
