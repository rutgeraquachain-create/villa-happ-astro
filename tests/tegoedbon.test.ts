/**
 * De tegoedbon.
 *
 * De actievoorwaarden stonden online voordat er ook maar één regel code voor
 * bestond: een bon van 75 euro, een jaar geldig, op het hele assortiment,
 * verzendkosten niet inbegrepen, niet inwisselbaar voor geld. Deze toets bewaakt
 * dat de code die vier beloftes waarmaakt, want de winnaar merkt het pas als
 * hij hem probeert te gebruiken, en dan is de campagne voorbij.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  maakCode, normaliseerCode, codeGeldigeVorm, kortingBedrag, verlooptOver,
} from '../src/lib/tegoedbon';

const CREATE = readFileSync(new URL('../src/pages/api/checkout/create.ts', import.meta.url), 'utf-8');
const WEBHOOK = readFileSync(new URL('../src/pages/api/checkout/webhook.ts', import.meta.url), 'utf-8');
const MIGRATIE = readFileSync(new URL('../supabase/migrations/20260909_tegoedbonnen.sql', import.meta.url), 'utf-8');

describe('de code', () => {
  it('heeft de vorm die op de bon staat', () => {
    for (let i = 0; i < 200; i++) expect(codeGeldigeVorm(maakCode())).toBe(true);
  });

  /**
   * De reden dat het alfabet beperkt is: een winnaar typt deze code over uit
   * een mail. O naast 0 en I naast 1 kost een mislukte inwisseling en een
   * mailtje aan de klantenservice.
   */
  it('gebruikt geen tekens die op elkaar lijken', () => {
    const alles = Array.from({ length: 400 }, () => maakCode()).join('');
    // 8 staat hier niet bij en dat is geen omissie: B zit niet in het alfabet,
    // dus 8 is niet te verwarren. O/0, I/1 en L/1 wel, en U vormt woorden.
    for (const teken of ['O', '0', 'I', '1', 'L', 'U', 'B']) {
      // Staat er één van deze in, dan is het alfabet uitgebreid zonder dat
      // iemand aan overtypen dacht.
      expect(alles.includes(teken), `${teken} zit in een uitgegeven code`).toBe(false);
    }
  });

  it('is niet elke keer dezelfde', () => {
    const codes = new Set(Array.from({ length: 500 }, () => maakCode()));
    expect(codes.size).toBeGreaterThan(490);
  });

  it.each([
    ['vh-acde-fghj', 'VH-ACDE-FGHJ'],
    ['VH ACDE FGHJ', 'VH-ACDE-FGHJ'],
    ['  vhacdefghj  ', 'VH-ACDE-FGHJ'],
    ['ACDEFGHJ', 'VH-ACDE-FGHJ'],
  ])('herkent %s als %s', (ruw, verwacht) => {
    expect(normaliseerCode(ruw)).toBe(verwacht);
  });

  /**
   * De tegenproef. Zonder deze zou een normalisatie die alles naar dezelfde
   * geldige vorm duwt ook groen geven, en dan accepteert de route elke invoer.
   */
  it.each(['', 'hallo', 'VH-ACDE', 'VH-ACDE-FGHJ-KMNP'])('wijst %s af', (ruw) => {
    expect(codeGeldigeVorm(normaliseerCode(ruw))).toBe(false);
  });
});

describe('wat een bon van het bedrag afhaalt', () => {
  it('haalt zijn volle waarde af als de bestelling groter is', () => {
    expect(kortingBedrag(7500, 12000)).toBe(7500);
  });

  /**
   * "Niet inwisselbaar voor geld." Een bon van 75 op een bestelling van 40 mag
   * geen negatief bedrag opleveren, want dat is bij Mollie een uitbetaling.
   */
  it('gaat nooit boven het subtotaal', () => {
    expect(kortingBedrag(7500, 4000)).toBe(4000);
  });

  it('wordt niet negatief bij een leeg mandje', () => {
    expect(kortingBedrag(7500, 0)).toBe(0);
  });

  /**
   * "Verzendkosten zijn niet inbegrepen." Dat is geen tekst maar een
   * rekenregel, en die zit erin doordat deze functie het subtotaal krijgt en
   * niet het totaal. Deze toets legt vast dat de aanroeper dat ook zo doet.
   */
  it('wordt in de kassa op het subtotaal losgelaten en niet op het totaal', () => {
    expect(CREATE).toContain('claimBon(sb, body.tegoedbon, order.id, subtotal)');
    expect(CREATE, 'de korting mag niet op het totaal worden losgelaten')
      .not.toContain('claimBon(sb, body.tegoedbon, order.id, total)');
  });
});

describe('de geldigheidsduur', () => {
  it('staat standaard op twaalf maanden, zoals de voorwaarden beloven', () => {
    const vanaf = new Date('2026-10-16T12:00:00.000Z');
    expect(verlooptOver(12, vanaf).toISOString().slice(0, 10)).toBe('2027-10-16');
  });
});

describe('de bon volgt de betaling', () => {
  /**
   * Bij het afrekenen wordt de bon geclaimd, niet ingewisseld. Pas als Mollie
   * zegt dat er betaald is, is hij op. Gaat de betaling niet door, dan hoort
   * hij weer bruikbaar te zijn: zonder dat kost één afgebroken afrekening de
   * winnaar zijn prijs.
   */
  it('wisselt pas in bij een geslaagde betaling', () => {
    const finalize = WEBHOOK.indexOf("transition.action === 'finalize'");
    const release = WEBHOOK.indexOf("transition.action === 'release'");
    expect(finalize, 'het finalize-blok is verdwenen').toBeGreaterThan(-1);
    expect(release, 'het release-blok is verdwenen').toBeGreaterThan(-1);

    // Op de aanroep zoeken en niet op de naam: de import bovenaan het bestand
    // is de eerste vindplaats, en die staat vóór beide blokken. Daar liep de
    // eerste versie van deze toets op stuk.
    const inwisselen = WEBHOOK.indexOf('await wisselBonIn(');
    const vrijgeven = WEBHOOK.indexOf('await geefBonVrij(');
    expect(inwisselen, 'wisselBonIn wordt niet aangeroepen').toBeGreaterThan(-1);
    expect(vrijgeven, 'geefBonVrij wordt niet aangeroepen').toBeGreaterThan(-1);
    expect(inwisselen, 'inwisselen staat niet in het finalize-blok').toBeGreaterThan(finalize);
    expect(inwisselen, 'inwisselen staat na het release-blok').toBeLessThan(release);
    expect(vrijgeven, 'vrijgeven staat niet in het release-blok').toBeGreaterThan(release);
  });

  /**
   * Een code die niet werkt mag de bezoeker niet stilzwijgend naar het volle
   * bedrag sturen. Op het Mollie-scherm valt niets meer uit te leggen.
   */
  it('stopt het afrekenen als de code niet werkt', () => {
    expect(CREATE).toContain("veld: 'tegoedbon'");
    expect(CREATE).toContain('status: 400');
  });
});

describe('de database beslist, niet de browser', () => {
  /**
   * Twee mensen die tegelijk dezelfde code invoeren mogen niet allebei korting
   * krijgen. Dat kan alleen als één UPDATE de beslissing neemt; een SELECT
   * gevolgd door een UPDATE laat er twee door.
   */
  it('claimt met één voorwaardelijke UPDATE', () => {
    expect(MIGRATIE).toMatch(/UPDATE public\.tegoedbonnen[\s\S]*?WHERE code = UPPER\(TRIM\(p_code\)\)/);
    expect(MIGRATIE).toContain('AND ingewisseld_op IS NULL');
    expect(MIGRATIE).toContain('AND verloopt_op > NOW()');
  });

  /**
   * Een claim die nooit vervalt zet de bon vast zodra iemand het betaalscherm
   * wegklikt. Dat is de stille vorm: geen fout, alleen een bon die het niet
   * meer doet.
   */
  it('laat een claim vervallen als er niet betaald wordt', () => {
    expect(MIGRATIE).toContain("geclaimd_op < NOW() - INTERVAL '30 minutes'");
  });

  it('houdt de tabel weg bij bezoekers', () => {
    expect(MIGRATIE).toContain('ENABLE ROW LEVEL SECURITY');
    expect(MIGRATIE).toMatch(/REVOKE ALL ON TABLE public\.tegoedbonnen FROM PUBLIC, anon, authenticated;/);
  });
});
