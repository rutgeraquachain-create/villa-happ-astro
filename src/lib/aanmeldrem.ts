/**
 * Villa Happ — remmen op de aanmeldstroom
 *
 * WAT HIER GEBEURD IS
 * -------------------
 * Gemeten 7 september 2026. Tussen 3 en 7 september kwamen er 64 aanmeldingen
 * binnen en gingen er 60 bevestigingsmails de deur uit. Op 4 september alleen al
 * 33 aanmeldingen uit 21 verschillende domeinen: `a1.net`, `gci.net` (Alaska),
 * `strivefitness.com.au`, `vtext.com` (de sms-gateway van Verizon), `state.gov`.
 * Vrijwel allemaal Amerikaans zakelijk, bij een merk met 28 sessies per week.
 *
 * Dat is een bot die het formulier gebruikt om andermans postvak te vullen, met
 * ons als afzender. Resultaat: twee bounces en één spamklacht op zestig mails.
 * Dat is 1,7 procent, waar Gmail en Outlook boven 0,3 procent al ingrijpen. De
 * verzendreputatie van villahapp.nl is precies wat de campagne van oktober nodig
 * heeft, en die stond weg te lekken.
 *
 * DRIE REMMEN, ELK VOOR EEN ANDER GEVAL
 * -------------------------------------
 * De rate limiter per IP hield dit niet tegen, want het verkeer kwam niet van
 * één adres. Vandaar dat hier iets anders staat: een bovengrens op wat er per
 * uur de deur uit mag, ongeacht van wie het verzoek komt.
 *
 * Die grens beschermt niet de database maar het domein. Loopt hij vol, dan wordt
 * de aanmelding wel vastgelegd maar de mail niet verstuurd. Een echte aanmelder
 * verliest dan zijn bevestigingsmail, en dat is vervelend. Honderd mails naar
 * vreemden is erger.
 *
 * WAT DE BEZOEKER TE HOREN KRIJGT, SINDS 9 SEPTEMBER 2026
 * Tot die dag kreeg hij exact hetzelfde antwoord als iemand van wie de mail wél
 * uitging: "kijk in je mail". Dat is de faalvorm die deze site vijf keer op één
 * dag opleverde, namelijk een verzendkant die zichzelf geslaagd verklaart. Wie
 * dan in zijn postvak niets vindt, denkt dat hij zich vergist heeft. De remmen
 * geven daarom nu `MELDING_REM` terug, en dat is geen foutmelding maar een
 * eerlijke: je staat genoteerd, de mail komt niet nu.
 *
 * Dit lekt niets over het adres. De rem is een toestand van de hele site en
 * zegt niets over de vraag of dit adres al op de lijst stond.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIE } from './herinnering';

/**
 * Tot wanneer de verhoogde grenzen gelden.
 *
 * Dezelfde datum als de sluiting van de herinneringsactie, uit één bron, plus
 * een dag lucht voor de naloop. Zie `campagneVenster()` hieronder: dit is de
 * sluitvoorwaarde die deze verruiming vanzelf laat opvallen zodra hij niet meer
 * nodig is.
 */
export const CAMPAGNE_TOT = new Date(Date.parse(ACTIE.sluit) + 24 * 60 * 60_000);

/**
 * Staan de verhoogde grenzen nog open?
 *
 * Een tijdelijk ruimere instelling geeft uit zichzelf geen signaal wanneer hij
 * overbodig wordt; hij blijft gewoon staan. Vandaar een expliciete einddatum en
 * een toets die omvalt zodra die datum voorbij is en de grenzen nog verhoogd
 * staan. Dat is het signaal om ze terug te zetten.
 */
export function campagneVenster(nu: Date = new Date()): boolean {
  return nu.getTime() <= CAMPAGNE_TOT.getTime();
}

/**
 * Hoeveel bevestigingsmails er per uur de deur uit mogen, over de hele site.
 *
 * WAAROM DIT VAN 12 NAAR 60 GING, OP 9 SEPTEMBER 2026
 * Twaalf was gekozen op de organische stand: vier aanmeldingen in de hele maand
 * augustus, tegen 33 op één dag tijdens de aanval. Voor de campagne van oktober
 * klopt dat getal niet meer. De aankondiging gaat via social, en één post kan in
 * één uur meer dan twaalf mensen naar het formulier sturen. Wat er dan gebeurde:
 * de aanmelding werd vastgelegd, de bevestigingsmail ging niet uit, en de
 * bezoeker kreeg exact hetzelfde antwoord als iemand die zijn mail wél kreeg.
 * Zonder die bevestiging is er geen dubbele opt-in en telt de aanmelding niet
 * mee. De rem kneep dus precies de maat af waarop deze campagne gestuurd wordt.
 *
 * Zestig is geen meting maar een afweging: het past een realistische piek uit
 * één social post, en het houdt een bot die er alsnog doorheen komt op zestig
 * mails per uur in plaats van honderden. De echte poorten ervóór zijn de
 * formuliercontrole en BotID; dit is de bodem daaronder.
 *
 * Na `CAMPAGNE_TOT` hoort dit terug naar twaalf. `tests/aanmeldrem.test.ts`
 * valt om zodra die datum voorbij is en dit getal nog op de campagnestand staat.
 */
export const MAX_BEVESTIGINGEN_PER_UUR = 60;

/** De stand van vóór de campagne, waar we na `CAMPAGNE_TOT` naar terug gaan. */
export const RUSTSTAND_PER_UUR = 12;

/**
 * Adressen waar dit merk niets te zoeken heeft.
 *
 * `vtext.com` en verwanten zijn sms-gateways van Amerikaanse providers: mail
 * daarheen wordt een tekstbericht op iemands telefoon. Die adressen komen bij
 * een Nederlandse kledingwinkel nooit legitiem binnen en ze staan bekend als
 * doelwit bij dit soort misbruik.
 */
const GEWEIGERDE_DOMEINEN = new Set([
  'vtext.com', 'txt.att.net', 'tmomail.net', 'messaging.sprintpcs.com',
  'vzwpix.com', 'mms.att.net', 'pm.sprint.com',
]);

export function domeinGeweigerd(email: string): boolean {
  const domein = email.split('@')[1]?.toLowerCase();
  return !!domein && GEWEIGERDE_DOMEINEN.has(domein);
}

/**
 * Waar een aanmelding vandaan kwam.
 *
 * Dit veld werd letterlijk overgenomen uit de request, dus de bot bepaalde zelf
 * wat er in de kolom kwam te staan. Veertig rijen kregen zo `atelier` mee
 * terwijl geen enkele pagina die waarde verstuurt, en daarmee loog de eerste
 * analyse over welk kanaal geraakt werd. Een herkomst die niet uit deze lijst
 * komt, wordt `onbekend`.
 */
const BRONNEN = new Set(['footer', 'finale', 'atelier', 'herinnering', 'checkout', 'campagne']);

export function schoneBron(bron: string | undefined | null): string {
  return bron && BRONNEN.has(bron) ? bron : 'onbekend';
}

/**
 * Mag er nu nog een mail van dit soort uit?
 *
 * Telt wat er het afgelopen uur van deze soort is klaargezet. Faalt de telling,
 * dan laten we hem door: een kapotte rem mag geen echte aanmelding blokkeren.
 *
 * Per soort en niet over alles heen, want de soorten hebben verschillende
 * grenzen nodig. Eén rem over de hele wachtrij zou een piek in orderbevestiging
 * de nieuwsbriefmail laten blokkeren, en dat is een verband dat niet bestaat.
 */
export async function magSoortVersturen(
  sb: SupabaseClient,
  soort: string,
  grens: number,
): Promise<boolean> {
  const eenUurGeleden = new Date(Date.now() - 60 * 60_000).toISOString();

  const { count, error } = await sb
    .from('uitgaande_mail')
    .select('id', { count: 'exact', head: true })
    .eq('soort', soort)
    .gte('created_at', eenUurGeleden);

  if (error) {
    console.error('[aanmeldrem] Tellen mislukte, mail wordt doorgelaten:', error.message);
    return true;
  }

  const vol = (count ?? 0) >= grens;
  if (vol) {
    console.error(
      '[aanmeldrem] Bovengrens bereikt voor', soort + ':', count, 'in het laatste uur.',
      'Wat binnenkomt wordt wel vastgelegd, maar krijgt geen mail.',
    );
  }
  return !vol;
}

/**
 * Wat de bezoeker leest als de rem dichtstaat.
 *
 * Eén zin, en hij moet drie dingen waarmaken: je invoer is bewaard, de mail komt
 * niet nu, en er is iets dat je zelf kunt doen. Geen excuus en geen foutcode:
 * een bezoeker die dit leest heeft niets fout gedaan.
 */
export const MELDING_REM =
  'We hebben je gegevens. Er gaan op dit moment veel mails tegelijk uit, ' +
  'dus je bevestigingsmail kan een uur op zich laten wachten. Komt hij niet, ' +
  'meld je dan later opnieuw aan.';

/** De rem op de nieuwsbriefbevestiging. Zie `MAX_BEVESTIGINGEN_PER_UUR`. */
export async function magBevestigingVersturen(sb: SupabaseClient): Promise<boolean> {
  return magSoortVersturen(sb, 'nieuwsbrief-bevestiging', MAX_BEVESTIGINGEN_PER_UUR);
}

/**
 * De rem op de inzendbevestiging van de herinneringsactie.
 *
 * Deze mail ging als enige ongeremd naar buiten, en dat bleek te tellen: de
 * acht botinzendingen van 8 september leverden zestien mails op, want elke
 * inzending stuurde er twee. Stond op twaalf, en gaat mee omhoog met
 * `MAX_BEVESTIGINGEN_PER_UUR` om dezelfde reden: dit is de mail die een
 * deelnemer zijn inzendnummer geeft, en zonder dat nummer weet hij niet of zijn
 * inzending is aangekomen. Zie de toelichting daar.
 */
export const MAX_INZENDINGEN_PER_UUR = 60;

export async function magInzendbevestigingVersturen(sb: SupabaseClient): Promise<boolean> {
  return magSoortVersturen(sb, 'herinnering-ontvangen', MAX_INZENDINGEN_PER_UUR);
}
