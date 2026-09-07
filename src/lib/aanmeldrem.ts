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
 * de aanmelding wel vastgelegd maar de mail niet verstuurd; de bezoeker krijgt
 * hetzelfde antwoord als anders. Een echte aanmelder verliest dan zijn
 * bevestigingsmail, en dat is vervelend. Honderd mails naar vreemden is erger.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Hoeveel bevestigingsmails er per uur de deur uit mogen, over de hele site.
 *
 * Twaalf is ruim boven wat dit merk organisch haalt (vier aanmeldingen in de
 * hele maand augustus) en ver onder wat de aanval deed (33 op één dag). Gaat de
 * campagne straks lopen en komen er echt pieken, dan mag dit omhoog; noteer er
 * dan bij op grond van welke meting.
 */
export const MAX_BEVESTIGINGEN_PER_UUR = 12;

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
 * Mag er nu nog een bevestigingsmail uit?
 *
 * Telt wat er het afgelopen uur is klaargezet. Faalt de telling, dan laten we
 * hem door: een kapotte rem mag geen echte aanmelding blokkeren.
 */
export async function magBevestigingVersturen(sb: SupabaseClient): Promise<boolean> {
  const eenUurGeleden = new Date(Date.now() - 60 * 60_000).toISOString();

  const { count, error } = await sb
    .from('uitgaande_mail')
    .select('id', { count: 'exact', head: true })
    .eq('soort', 'nieuwsbrief-bevestiging')
    .gte('created_at', eenUurGeleden);

  if (error) {
    console.error('[aanmeldrem] Tellen mislukte, mail wordt doorgelaten:', error.message);
    return true;
  }

  const vol = (count ?? 0) >= MAX_BEVESTIGINGEN_PER_UUR;
  if (vol) {
    console.error(
      '[aanmeldrem] Bovengrens bereikt:', count, 'bevestigingsmails in het laatste uur.',
      'Nieuwe aanmeldingen worden wel vastgelegd maar krijgen geen mail.',
    );
  }
  return !vol;
}
