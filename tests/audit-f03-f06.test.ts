/**
 * Bevindingen uit de externe audit van 12 september 2026 (F03, F04, F05, F06).
 *
 * De audit staat in `Websites_en_tools/Villa Happ/Audits/2026-09-12/`. Elke
 * bevinding hieronder is eerst zelf nagemeten voordat hij een reparatie kreeg:
 * F03 tegen de echte functie op de productiedatabase, de rest tegen de code.
 *
 * Wat ze delen met de vorige ronde: geen van vieren gaf een foutmelding. De
 * opruimtaak meldde keurig hoeveel orders hij sloot, de checkout toonde een
 * net bedrag, en de bestelpagina zette braaf `noindex` terwijl hij zijn eigen
 * sleutel aan Google gaf.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

/**
 * Hetzelfde bestand zonder commentaar. Nodig voor elke "dit patroon staat er
 * NIET meer"-toets, want de toelichtingen citeren de oude code met opzet.
 */
function zonderCommentaar(pad: string): string {
  const bron = lees(pad);
  return pad.endsWith('.sql')
    ? bron.replace(/^\s*--.*$/gm, '')
    : bron.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('F03 · de opruimtaak laat geen reservering achter', () => {
  /**
   * GEMETEN OP DE PRODUCTIEDATABASE, in een transactie die terugdraaide. Drie
   * varianten met 1, 2 en 3 verlopen bestellingen, één aanroep van de functie:
   * reserved bleef 0, 1 en 2 staan, terwijl alle bestellingen wél gesloten
   * werden. Een UPDATE raakt elke doelrij hooguit één keer, ook als er drie
   * orderregels op wijzen, en de rest verdween zonder melding.
   */
  const sql = zonderCommentaar('supabase/migrations/20260912_spookreserveringen.sql');

  it('telt de aantallen eerst per variant op', () => {
    expect(sql).toMatch(/per_variant AS \(/);
    expect(sql).toMatch(/SUM\(oi\.quantity\)::INT AS totaal/);
    expect(sql).toMatch(/GROUP BY oi\.variant_id/);
  });

  it('trekt af van de optelling en niet van een losse orderregel', () => {
    expect(sql).toMatch(/SET reserved = GREATEST\(0, i\.reserved - pv\.totaal\)/);
    // Precies het patroon dat de fout was: aftrekken van één orderregel.
    expect(sql).not.toMatch(/i\.reserved - oi\.quantity/);
    /**
     * En de UPDATE op de voorraad haalt zijn bron uit de optelling, niet
     * rechtstreeks uit de orderregels. `order_items` mag elders in de functie
     * best voorkomen, want de optelling zelf leest die tabel; het gaat erom
     * waar deze ene UPDATE vandaan telt.
     */
    const update = sql.slice(sql.indexOf('UPDATE public.inventory'));
    const eindeUpdate = update.indexOf('RETURNING');
    expect(update.slice(0, eindeUpdate)).toMatch(/FROM per_variant pv/);
    expect(update.slice(0, eindeUpdate)).not.toMatch(/order_items/);
  });

  it('houdt de bestaande waarborgen aan', () => {
    // Zonder deze blijft een gelijktijdige run dezelfde orders oppakken.
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    // Nooit onder nul, ook niet als de voorraad handmatig is gecorrigeerd.
    expect(sql).toMatch(/GREATEST\(0,/);
    expect(sql).toMatch(/SET search_path = ''/);
  });

  it('sluit de orders nog steeds en geeft ze terug', () => {
    expect(sql).toMatch(/SET status = 'cancelled', payment_status = 'expired'/);
    expect(sql).toMatch(/RETURNS TABLE \(order_id UUID, order_number TEXT, regels INT\)/);
  });
});

describe('F04 · een ordertoken komt niet in de meetketen', () => {
  /**
   * Het token in `/bestelling/<token>` is een sleutel met 120 dagen
   * geldigheid, en de pagina gaf via de gewone layout `location.pathname` door
   * aan de dataLayer en aan Vercel Analytics. De bedanktpagina droeg hem in de
   * query, waar GTM hem als `page_location` meestuurt.
   */
  const base = lees('src/layouts/Base.astro');

  it('Base kent een privaat-stand die alle meting uitzet', () => {
    expect(base).toMatch(/privaat\?: boolean/);
    expect(base).toMatch(/const gtmId = \(!preview && !privaat\)/);
    expect(base).toMatch(/\{!privaat && <Analytics \/>\}/);
  });

  it('de bestelpagina staat op privaat', () => {
    expect(lees('src/pages/bestelling/[token].astro')).toMatch(/privaat=\{true\}/);
  });

  it('het token verdwijnt uit de URL vóór GTM laadt', () => {
    const kaal = zonderCommentaar('src/layouts/Base.astro');
    const schoner = kaal.indexOf("u.searchParams.delete('t')");
    const gtm = kaal.indexOf('googletagmanager.com/gtm.js');
    expect(schoner).toBeGreaterThan(-1);
    expect(gtm).toBeGreaterThan(-1);
    // Volgorde in de head is hier de hele beveiliging: laadt GTM eerder, dan
    // heeft hij `page_location` met token er al in gelezen.
    expect(schoner).toBeLessThan(gtm);
  });

  it('de bedanktpagina leest het token uit het geheugen, niet uit de query', () => {
    const bron = lees('src/pages/checkout/success.astro');
    expect(bron).toMatch(/window as any\)\.__vhOrderToken \|\| params\.get\('t'\)/);
  });

  it('er komt geen nieuwe pagina met een token in het pad zonder privaat', () => {
    // Een tweede portaalpagina zou de fout opnieuw introduceren. Deze toets
    // valt om zodra iemand er een aanmaakt, en dat rood is de bedoeling.
    const paden = ['src/pages/bestelling/[token].astro'];
    for (const pad of paden) {
      expect(lees(pad), `${pad} draagt een token in het pad en moet privaat zijn`)
        .toMatch(/privaat=\{true\}/);
    }
  });
});

describe('F05 · het checkoutoverzicht volgt het mandje', () => {
  /**
   * Live gereproduceerd: één cap gaf € 36,90 op de knop. In de drawer naar twee
   * caps verhogen liet die knop op € 36,90 staan, terwijl indienen opnieuw
   * `getCart()` leest en dus twee caps met € 64,85 zou aanbieden.
   */
  const bron = lees('src/pages/checkout/index.astro');

  it('abonneert op wijzigingen in het mandje', () => {
    expect(bron).toMatch(/onCartChange/);
    expect(bron).toMatch(/const stopCartLuisteraar = onCartChange\(renderSummary\)/);
  });

  it('ruimt die luisteraar op bij navigatie', () => {
    // Zonder dit stapelen ze zich op bij elke swap van de ClientRouter.
    expect(bron).toMatch(/astro:before-swap[\s\S]{0,80}stopCartLuisteraar/);
  });
});

describe('F06 · het gekozen land overleeft een herlading', () => {
  /**
   * Live gereproduceerd: België plus Antwerpen, € 12,50 verzending, € 40,45
   * totaal. Na een refresh bleef Antwerpen staan en sprong het land terug naar
   * Nederland. De herstelregel was `!el.value`, en een keuzelijst met een
   * standaardwaarde is nooit leeg.
   */
  const bron = lees('src/pages/checkout/index.astro');

  it('herstelt een keuzelijst op de opgeslagen waarde', () => {
    expect(bron).toMatch(/isKeuzelijst\(el\)/);
    expect(bron).toMatch(/if \(bestaat\) el\.value = saved\[name\]/);
  });

  it('vertrouwt de opgeslagen waarde niet blind', () => {
    // sessionStorage staat op het apparaat van de bezoeker. Een landcode die
    // niet in de lijst staat, zou de verzendkosten laten struikelen.
    expect(bron).toMatch(/\[\.\.\.el\.options\]\.some\(\(o\) => o\.value === saved\[name\]\)/);
  });

  it('laat tekstvelden ongemoeid die de bezoeker al invulde', () => {
    // De oude regel was goed voor tekstvelden en die moet blijven: wie al iets
    // heeft getypt, wil dat niet overschreven zien door een oude waarde.
    expect(bron).toMatch(/if \(!el\.value\) el\.value = saved\[name\]/);
  });
});
