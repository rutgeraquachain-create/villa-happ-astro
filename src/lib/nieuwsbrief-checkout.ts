/**
 * Villa Happ — een vinkje bij het afrekenen wordt een inschrijving
 *
 * WAAROM HIER GEEN BEVESTIGINGSMAIL HOORT
 * ---------------------------------------
 * Bij het aanmeldformulier is dubbele opt-in de regel, en met reden: iedereen
 * kan daar andermans adres intypen. Zie de toelichting boven in `nieuwsbrief.ts`.
 *
 * Bij het afrekenen ligt dat anders. Deze persoon heeft met dit adres een
 * bestelling geplaatst en betaald, en krijgt op datzelfde adres de bevestiging
 * met zijn bestelnummer. Het adres is dus aantoonbaar van hem, en dat is precies
 * wat een bevestigingsklik elders moet bewijzen. Een tweede mail eist bewijs dat
 * de betaling al geleverd heeft, en kost alleen inschrijvingen.
 *
 * Wat er in plaats daarvan gebeurt: de bestelbevestiging vermeldt dat hij op de
 * lijst staat en zet de uitschrijflink erbij. Zo is de mededeling onmiddellijk
 * en de uitweg één klik ver, wat de kern is van art. 11.7 Telecomwet.
 *
 * WAAROM PAS NA BETALING
 * ----------------------
 * Het vinkje staat op het bestelformulier, maar de inschrijving volgt pas als de
 * betaling binnen is. Twee redenen. De onderbouwing hierboven leunt op een
 * geslaagde transactie, en de mededeling zit in de bestelbevestiging, die ook
 * alleen dan verstuurd wordt. Een afgebroken betaling zou anders iemand op de
 * lijst zetten zonder dat hij daar ooit bericht over krijgt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseerEmail, inschrijfstand } from './nieuwsbrief';

export type Inschrijfuitslag =
  /** Nieuw op de lijst gezet, of teruggezet na een eerdere uitschrijving. */
  | 'toegevoegd'
  /** Stond er al actief op. Niets gedaan, en de mail meldt het dus ook niet. */
  | 'stond-er-al'
  /** Niet aangevinkt, of het schrijven mislukte. */
  | 'niet';

/**
 * Zet een klant op de lijst na een betaalde bestelling.
 *
 * Faalt dit, dan is dat geen reden om de bestelling te laten struikelen: de
 * betaling is binnen en de bevestiging moet de deur uit. Vandaar dat de fout
 * hier gelogd wordt en niet omhoog gegooid.
 */
export async function meldAanViaCheckout(
  sb: SupabaseClient,
  email: string,
  wil: boolean | null | undefined,
): Promise<Inschrijfuitslag> {
  if (!wil) return 'niet';

  const adres = normaliseerEmail(email);
  if (!adres.includes('@')) return 'niet';

  const { data: bestaand, error: leesFout } = await sb
    .from('newsletter_subscribers')
    .select('confirmed, unsubscribed_at')
    .eq('email', adres)
    .maybeSingle();

  if (leesFout) {
    console.error('[nieuwsbrief] Kon inschrijving niet lezen:', leesFout.message);
    return 'niet';
  }

  // Stond hij er al actief op, dan verandert er niets. Belangrijk voor de mail:
  // "je staat nu ook op de lijst" onder een tweede bestelling leest als een
  // fout van ons, want hij stond er al.
  if (inschrijfstand(bestaand) === 'actief') return 'stond-er-al';

  /**
   * Iemand die zich eerder uitschreef en nu bewust het vakje aanvinkt, komt
   * terug op de lijst. Dat is nieuwe toestemming en geen ongedaan gemaakte
   * uitschrijving, dus `unsubscribed_at` gaat leeg. Zonder dat leegmaken zou
   * `inschrijfstand` hem uitgeschreven blijven noemen en zou het vinkje stil
   * niets doen.
   */
  const nu = new Date().toISOString();
  const { error } = await sb
    .from('newsletter_subscribers')
    .upsert({
      email: adres,
      source: 'checkout',
      confirmed: true,
      confirmed_at: nu,
      unsubscribed_at: null,
    }, { onConflict: 'email' });

  if (error) {
    console.error('[nieuwsbrief] Inschrijven via checkout mislukte:', error.message);
    return 'niet';
  }

  return 'toegevoegd';
}
