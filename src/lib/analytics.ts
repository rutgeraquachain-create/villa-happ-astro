/**
 * Villa Happ — dataLayer-contract
 *
 * Eén plek die naar de dataLayer schrijft. GTM leest hier zijn events uit;
 * de meetplanafspraken staan in docs/meetplan.md.
 *
 * Twee harde regels:
 *
 *  1. **Nooit persoonsgegevens.** Geen e-mailadres, naam, telefoonnummer of
 *     adres, in geen enkele parameter. GA4 weigert accounts daarop.
 *  2. **Pas pushen als de actie aantoonbaar voltooid is.** Niet op een klik
 *     of een submit, maar op het antwoord dat bevestigt dat het gelukt is.
 *     Een `purchase` op paginaladen telt elke afgebroken betaling als omzet.
 *
 * Deze module werkt ook als GTM niet geladen is: de dataLayer is dan een
 * gewone array die niemand leest. Dat maakt het veilig om de events al te
 * versturen voordat de container bestaat.
 */

/** Bedragen staan overal in centen; GA4 wil euro's. */
const eur = (cents: number) => Math.round(cents) / 100;

function push(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  // `ecommerce` eerst legen: GA4 voegt anders items van een vorig event samen
  // met het huidige, en dan bevat een add_to_cart ineens ook het vorige stuk.
  w.dataLayer.push({ ecommerce: null });
  w.dataLayer.push(payload);
}

export interface AnalyticsItem {
  item_id: string;
  item_name: string;
  price_cents: number;
  quantity?: number;
  item_variant?: string;
}

function toGa4Items(items: AnalyticsItem[]) {
  return items.map((i) => ({
    item_id: i.item_id,
    item_name: i.item_name,
    ...(i.item_variant ? { item_variant: i.item_variant } : {}),
    price: eur(i.price_cents),
    quantity: i.quantity ?? 1,
  }));
}

function totaal(items: AnalyticsItem[]) {
  return eur(items.reduce((s, i) => s + i.price_cents * (i.quantity ?? 1), 0));
}

/** Paginaweergave. Nodig omdat de SPA-router geen echte pageload doet. */
export function trackPageView(path: string, title: string) {
  push({ event: 'vh_page_view', page_path: path, page_title: title });
}

export function trackViewItem(item: AnalyticsItem) {
  push({
    event: 'view_item',
    ecommerce: { currency: 'EUR', value: totaal([item]), items: toGa4Items([item]) },
  });
}

export function trackAddToCart(item: AnalyticsItem) {
  push({
    event: 'add_to_cart',
    ecommerce: { currency: 'EUR', value: totaal([item]), items: toGa4Items([item]) },
  });
}

export function trackBeginCheckout(items: AnalyticsItem[]) {
  if (!items.length) return;
  push({
    event: 'begin_checkout',
    ecommerce: { currency: 'EUR', value: totaal(items), items: toGa4Items(items) },
  });
}

/**
 * Aankoop. Alleen aanroepen als de betaling bevestigd is — zie
 * `/api/checkout/status`, dat de status rechtstreeks bij Mollie ophaalt.
 *
 * `transaction_id` is het bestelnummer. GA4 ontdubbelt daarop, dus een klant
 * die de bedanktpagina ververst telt één keer. Blijft het bestelnummer leeg,
 * dan pushen we niets: een `purchase` zonder id telt bij elke reload opnieuw.
 */
export function trackPurchase(opts: {
  orderNumber: string;
  totalCents: number;
  shippingCents?: number;
  items?: AnalyticsItem[];
}) {
  if (!opts.orderNumber) return;
  push({
    event: 'purchase',
    ecommerce: {
      transaction_id: opts.orderNumber,
      currency: 'EUR',
      value: eur(opts.totalCents),
      ...(opts.shippingCents !== undefined ? { shipping: eur(opts.shippingCents) } : {}),
      items: toGa4Items(opts.items || []),
    },
  });
}

/**
 * Lead. Vuurt op het bevestigde antwoord van de server, niet op de klik.
 * `lead_type` onderscheidt de drie ingangen: het contactformulier, een merk
 * dat via Villa Happ verkocht wil worden, en een winkel die Villa Happ wil
 * inkopen. Die laatste twee zijn tegengestelde stromen en horen in de
 * rapportage niet op één hoop.
 */
export function trackGenerateLead(
  leadType: 'contact' | 'merkaanmelding' | 'verkooppunt-aanvraag',
) {
  push({ event: 'generate_lead', lead_type: leadType });
}
