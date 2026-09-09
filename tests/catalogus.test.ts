/**
 * De catalogus: wat er gebeurt als de database iets anders geeft dan verwacht,
 * en hoe vaak hij hem bevraagt.
 *
 * De twee takken die ertoe doen komen in een gewone build nooit voor. Juist
 * daarom staan ze hier: zij bepalen wat er live komt te staan op de dag dat
 * het misgaat, en tot 9 september 2026 was een van de twee stil.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { catalogusUitRijen, getCatalog, vergeetCatalogus } from '../src/lib/catalog';
import { DEMO_PRODUCTS } from '../src/lib/demo-products';

/** Eén rij zoals Supabase hem teruggeeft, genoeg voor de vertaling. */
const RIJ = {
  slug: 'proefproduct',
  name: 'Proefproduct',
  price_cents: 1000,
  short_desc: null,
  description: null,
  image_url: '/img/products/x.webp',
  gallery: null,
  details: null,
  note: null,
  edition: null,
  badge: null,
  featured: null,
  category: null,
  product_variants: [{ id: 'v1', sku: 'S1', size: 'M', color: 'zwart', inventory: { quantity: 3, reserved: 1 } }],
};

afterEach(() => {
  vergeetCatalogus();
  vi.restoreAllMocks();
});

describe('een lege of mislukte uitkomst', () => {
  /**
   * Dit is de tak die op 9 september 2026 is veranderd. Nul gepubliceerde
   * producten viel stil terug op de demo-catalogus, en dan staan er demoprijzen
   * en demo-voorraad live. De invariant in CLAUDE.md wil precies dat uitsluiten;
   * hij dekte alleen de mislukte query en niet de lege uitkomst.
   */
  it('breekt in productie bij nul gepubliceerde producten', () => {
    expect(() => catalogusUitRijen([], null, true)).toThrow(/nul gepubliceerde producten/i);
    expect(() => catalogusUitRijen(null, null, true)).toThrow(/nul gepubliceerde producten/i);
  });

  it('breekt in productie bij een mislukte query', () => {
    expect(() => catalogusUitRijen(null, { message: 'kapot' }, true)).toThrow(/kapot/);
  });

  /**
   * Buiten productie mag hij wel terugvallen, anders is er lokaal zonder
   * sleutels niets te ontwikkelen. Dat is de tegenproef: dezelfde invoer, een
   * andere uitkomst. Eén uitkomst is ook wat je krijgt als de controle er niet
   * is.
   */
  it('valt buiten productie terug op de demo-catalogus', () => {
    const stil = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(catalogusUitRijen([], null, false)).toBe(DEMO_PRODUCTS);
    expect(catalogusUitRijen(null, { message: 'kapot' }, false)).toBe(DEMO_PRODUCTS);
    stil.mockRestore();
  });

  it('vertaalt een gewone rij en trekt gereserveerde voorraad eraf', () => {
    const uit = catalogusUitRijen([RIJ], null, true);
    expect(uit).toHaveLength(1);
    expect(uit[0].slug).toBe('proefproduct');
    // 3 op voorraad, 1 gereserveerd.
    expect(uit[0].variants[0].stock).toBe(2);
  });
});

describe('de catalogus wordt onthouden', () => {
  /**
   * Gemeten 8 september 2026 in de Supabase-logs: 74 identieke queries per
   * build, één per geprerenderde pagina, omdat `Header` in `Base` staat.
   *
   * Zonder sleutels levert `getCatalog()` de demo-catalogus, en dan is er geen
   * query om te tellen. Wat hier wél te meten valt is dat herhaalde aanroepen
   * dezelfde belofte teruggeven, en dat is precies het mechanisme dat de 74
   * queries tot één terugbrengt.
   */
  it('geeft bij herhaalde aanroepen dezelfde belofte terug', () => {
    const eerste = getCatalog();
    const tweede = getCatalog();
    const derde = getCatalog();
    expect(tweede).toBe(eerste);
    expect(derde).toBe(eerste);
  });

  it('haalt opnieuw op zodra de houdbaarheid verlopen is', () => {
    const eerste = getCatalog();
    // Een minuut en een seconde verder. De klok verzetten in plaats van
    // wachten, anders duurt deze toets een minuut.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61_000);
    expect(getCatalog()).not.toBe(eerste);
  });

  /**
   * Wat hier NIET staat: een toets op het weggooien van een mislukte belofte.
   * `getCatalog()` faalt zonder sleutels niet, en de faalweg is alleen te
   * bereiken door de Supabase-module te vervangen. Een toets die dat niet doet
   * en toch zo heet, meldt groen zonder iets te meten. Die regel staat in de
   * code met de reden erbij en is hier bewust onbewaakt.
   */
});
