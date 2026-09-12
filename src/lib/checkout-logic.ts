/**
 * Villa Happ — Checkout-logica (puur, testbaar)
 *
 * Geen I/O in dit bestand: alleen berekeningen en statusovergangen.
 * De API-routes (api/checkout/*) importeren dit; de unit tests ook.
 */

import { z } from 'zod';

// Tarieven staan in een eigen module zonder dependencies, zodat het mandje
// in de browser dezelfde berekening gebruikt zonder zod mee te slepen.
export { FREE_SHIPPING_CENTS, SHIPPING_RATES_CENTS, shippingCost } from './shipping';

export const CheckoutSchema = z.object({
  items: z.array(z.object({
    variant_id: z.uuid(),
    quantity: z.number().int().min(1).max(20),
  })).min(1).max(30),
  customer: z.object({
    email: z.email(),
    first_name: z.string().min(1).max(80),
    last_name: z.string().min(1).max(80),
    accepts_marketing: z.boolean().optional(),
  }),
  shipping: z.object({
    street: z.string().min(1).max(120),
    house_number: z.string().min(1).max(20),
    postal_code: z.string().min(1).max(12),
    city: z.string().min(1).max(80),
    country: z.enum(['NL', 'BE', 'DE']).default('NL'),
    phone: z.string().max(30).optional(),
  }),
  /**
   * Code van een tegoedbon. Optioneel, en alleen een voorstel: de waarde, de
   * geldigheid en de vraag of hij al gebruikt is komen uit de database. Zie
   * `lib/tegoedbon.ts`. Ruim genomen qua lengte omdat een bezoeker spaties en
   * streepjes meetypt; `normaliseerCode` haalt die eruit.
   */
  tegoedbon: z.string().max(32).optional(),
  /**
   * Herkomst van het bezoek als JSON-tekst. Alleen een voorstel; de server
   * schoont hem op in lib/herkomst.ts en vertrouwt geen enkel veld letterlijk.
   */
  // Geen .max() hier: een te lang meetveld mag nooit de hele aanmelding of
  // bestelling laten afketsen. schoneHerkomst() laat te lange invoer stil vallen.
  herkomst: z.string().optional(),
});

export type CheckoutPayload = z.infer<typeof CheckoutSchema>;

/**
 * Vertaal een Mollie-paymentstatus naar de gewenste orderstatus plus
 * de voorraadactie. Idempotent: een order die al 'paid' is verandert
 * nooit meer en levert nooit een tweede voorraadmutatie op (Mollie
 * mag de webhook meermaals aanroepen).
 */
export type InventoryAction = 'finalize' | 'release' | 'none';

export interface StatusTransition {
  payment_status: string;
  status: string;
  action: InventoryAction;
  markPaidAt: boolean;
}

/**
 * Grove staat van een betaling voor de bedanktpagina. Mollie stuurt de
 * klant naar `redirectUrl` bij élke afloop — betaald, mislukt, verlopen of
 * afgebroken in de bankapp — dus die pagina moet zelf de status ophalen
 * voordat ze "bedankt" zegt of het mandje leegt.
 *
 * `authorized` telt bewust als 'pending': het geld is gereserveerd maar nog
 * niet geïncasseerd, en de webhook boekt de voorraad pas af bij 'paid'.
 * Onbekende statussen zijn ook 'pending': dan blijft het mandje staan en
 * beloven we niets.
 */
export type PaymentState = 'paid' | 'pending' | 'failed';

export function paymentState(mollieStatus: string): PaymentState {
  switch (mollieStatus) {
    case 'paid':
      return 'paid';
    case 'failed':
    case 'canceled':
    case 'expired':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Betaalstatussen waarna deze functie niets meer mag veranderen.
 *
 * `paid` omdat een betaalde order niet nog eens betaald wordt, `refunded` omdat
 * een terugbetaalde order geen betaalde order is. Beide gaan over dezelfde
 * vraag: is het geld afgehandeld.
 */
const AFGEROND = new Set(['paid', 'refunded']);

export function mapMollieStatus(
  mollieStatus: string,
  current: { payment_status: string; status: string },
): StatusTransition {
  const unchanged: StatusTransition = {
    payment_status: current.payment_status,
    status: current.status,
    action: 'none',
    markPaidAt: false,
  };

  /**
   * Eenmaal afgerond blijft afgerond: niets meer muteren.
   *
   * `refunded` hoort hier bij, en dat is gemeten op 12 september 2026. De
   * webhook vangt een terugbetaling hierboven af en keert dan meteen terug,
   * maar alleen zolang het terugbetaalde bedrag hoger is dan wat er al stond.
   * Roept Mollie de webhook nog eens aan met dezelfde terugbetaling, en dat doet
   * hij (de terugbetaling zelf wisselt van status), dan valt het verzoek door
   * naar deze functie. De betaling staat bij Mollie nog steeds op `paid`, want
   * een terugbetaling is daar een los object. Met alleen `'paid'` in deze regel
   * gaf deze functie dan `finalize` terug: de voorraad ging een tweede keer van
   * de plank, de order sprong van `refunded` terug naar `paid`, en de tegoedbon
   * werd opnieuw ingewisseld. Geen foutmelding, en de eerstvolgende
   * terugbetaling van Rutger zou hem raken.
   */
  if (AFGEROND.has(current.payment_status)) return unchanged;

  switch (mollieStatus) {
    case 'paid':
      return { payment_status: 'paid', status: 'paid', action: 'finalize', markPaidAt: true };
    case 'failed':
    case 'canceled':
    case 'expired': {
      // Eenmaal geannuleerd niet nogmaals voorraad vrijgeven.
      const alreadyCancelled = current.status === 'cancelled';
      return {
        payment_status: mollieStatus === 'canceled' ? 'failed' : mollieStatus,
        status: 'cancelled',
        action: alreadyCancelled ? 'none' : 'release',
        markPaidAt: false,
      };
    }
    case 'authorized':
      return { ...unchanged, payment_status: 'authorized' };
    case 'pending':
    case 'open':
      return { ...unchanged, payment_status: 'open' };
    default:
      return unchanged;
  }
}
