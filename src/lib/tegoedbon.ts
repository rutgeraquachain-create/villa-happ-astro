/**
 * Villa Happ — tegoedbonnen
 *
 * De winnaar van de herinneringsactie krijgt een tegoedbon van 75 euro. De
 * actievoorwaarden staan online en die zijn hier leidend, niet andersom:
 *
 *  - te besteden in de webshop van Villa Happ;
 *  - een jaar geldig vanaf de dag van uitgifte;
 *  - geldt op het hele assortiment;
 *  - verzendkosten zijn niet inbegrepen;
 *  - niet inwisselbaar voor geld.
 *
 * Die laatste twee bepalen de rekenregel: de korting gaat van het subtotaal af
 * en nooit van de verzendkosten, en er komt niets terug in geld. Is de
 * bestelling kleiner dan de bon, dan vervalt het verschil. Dat staat zo bij het
 * invoerveld, want een bezoeker hoort dat te weten vóór hij afrekent en niet
 * erna.
 *
 * WAAROM DE CONTROLE HIER STAAT EN NIET IN DE BROWSER
 * Alles wat de bezoeker meestuurt is een voorstel. De waarde van de bon, de
 * geldigheid en de vraag of hij al gebruikt is, komen uit de database, en het
 * claimen gaat via één RPC die atomair is. Twee mensen die tegelijk dezelfde
 * code invoeren kunnen dus niet allebei korting krijgen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Het alfabet van een code.
 *
 * Zonder I, O, L, U, 0 en 1. Een winnaar leest deze code over uit een mail en
 * typt hem in een telefoon, en dan is het verschil tussen O en 0 een
 * mislukte inwisseling met een melding die zegt dat de bon niet bestaat.
 * U ligt eruit omdat de reeks anders per ongeluk een woord kan vormen.
 */
const ALFABET = 'ACDEFGHJKMNPQRSTVWXYZ23456789';

/** `VH-XXXX-XXXX`. Het voorvoegsel maakt hem herkenbaar in een postvak. */
export function maakCode(willekeurig: () => number = Math.random): string {
  const blok = () =>
    Array.from({ length: 4 }, () => ALFABET[Math.floor(willekeurig() * ALFABET.length)]).join('');
  return `VH-${blok()}-${blok()}`;
}

/**
 * Wat de bezoeker typt naar wat er in de database staat.
 *
 * Hoofdletters, spaties eruit, en streepjes op de vaste plek. Wie de code
 * overneemt uit een mail neemt vaak een spatie mee, en wie hem uit zijn hoofd
 * typt laat de streepjes weg. Dat mag geen reden zijn om een geldige bon af te
 * wijzen.
 */
export function normaliseerCode(ruw: string): string {
  const kaal = ruw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const zonderVoorvoegsel = kaal.startsWith('VH') ? kaal.slice(2) : kaal;
  if (zonderVoorvoegsel.length !== 8) return kaal;
  return `VH-${zonderVoorvoegsel.slice(0, 4)}-${zonderVoorvoegsel.slice(4)}`;
}

/** Ziet dit eruit als een code? Alleen de vorm, niets over geldigheid. */
export function codeGeldigeVorm(code: string): boolean {
  return /^VH-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
}

/**
 * Wat een bon van dit subtotaal afhaalt.
 *
 * Nooit meer dan het subtotaal, want een negatief totaal bij Mollie is geen
 * betaling maar een uitbetaling. En nooit van de verzendkosten af: dat staat in
 * de voorwaarden en het is de reden dat deze functie het subtotaal krijgt en
 * niet het totaal.
 */
export function kortingBedrag(waardeCents: number, subtotaalCents: number): number {
  return Math.max(0, Math.min(waardeCents, subtotaalCents));
}

export interface Tegoedbon {
  id: string;
  code: string;
  waarde_cents: number;
  verloopt_op: string;
  ingewisseld_op: string | null;
}

export type BonUitslag =
  | { ok: true; bon: Tegoedbon; korting: number }
  | { ok: false; melding: string };

/**
 * Eén melding voor elke reden waarom een code niet werkt.
 *
 * Bewust niet uitgesplitst naar "bestaat niet", "verlopen" en "al gebruikt".
 * Die drie samen vormen een orakel waarmee iemand codes kan aflopen tot hij een
 * geldige vindt, en de winnaar heeft niets aan het verschil: hij moet hoe dan
 * ook contact opnemen. In het beheerscherm staat wél wat er aan de hand is.
 */
export const BON_AFGEWEZEN =
  'Deze code werkt niet. Controleer of je hem goed hebt overgenomen, of neem contact met ons op.';

/**
 * Claim een bon voor deze bestelling.
 *
 * Atomair via `claim_tegoedbon`: de UPDATE in de database beslist wie hem
 * krijgt. Faalt de RPC, dan is dat geen reden om de bestelling te blokkeren,
 * maar wél om geen korting te geven. De bezoeker krijgt dan de melding en kan
 * opnieuw. Een bestelling die per ongeluk zonder korting doorgaat is te
 * herstellen; een bon die twee keer wordt gebruikt niet.
 */
export async function claimBon(
  sb: SupabaseClient,
  ruweCode: string,
  orderId: string,
  subtotaalCents: number,
): Promise<BonUitslag> {
  const code = normaliseerCode(ruweCode);
  if (!codeGeldigeVorm(code)) return { ok: false, melding: BON_AFGEWEZEN };

  const { data, error } = await sb.rpc('claim_tegoedbon', { p_code: code, p_order: orderId });
  if (error) {
    console.error('[tegoedbon] Claimen mislukte:', error.message);
    return { ok: false, melding: BON_AFGEWEZEN };
  }

  const bon = (Array.isArray(data) ? data[0] : data) as Tegoedbon | undefined;
  if (!bon) return { ok: false, melding: BON_AFGEWEZEN };

  return { ok: true, bon, korting: kortingBedrag(bon.waarde_cents, subtotaalCents) };
}

/** De claim definitief maken. Aangeroepen zodra Mollie zegt dat er betaald is. */
export async function wisselBonIn(sb: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await sb.rpc('wissel_tegoedbon_in', { p_order: orderId });
  if (error) console.error('[tegoedbon] Inwisselen mislukte:', error.message);
}

/** De claim teruggeven, net als de gereserveerde voorraad bij een mislukte betaling. */
export async function geefBonVrij(sb: SupabaseClient, orderId: string): Promise<void> {
  const { error } = await sb.rpc('geef_tegoedbon_vrij', { p_order: orderId });
  if (error) console.error('[tegoedbon] Vrijgeven mislukte:', error.message);
}

/** Een jaar geldig, zoals de actievoorwaarden beloven. */
export function verlooptOver(maanden = 12, vanaf: Date = new Date()): Date {
  const d = new Date(vanaf);
  d.setMonth(d.getMonth() + maanden);
  return d;
}
