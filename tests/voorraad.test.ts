/**
 * Voorraadlogica. De rekenregels zitten in pure functies, dus ze zijn hier
 * te toetsen zonder database.
 */

import { describe, it, expect } from 'vitest';
import {
  vrijVerkoopbaar, staatVan, sorteerVoorraad, kerncijfers,
  leesMutatie, mutatieToegestaan, type VoorraadRij,
} from '../src/lib/voorraad';

const rij = (over: Partial<VoorraadRij> = {}): VoorraadRij => ({
  variantId: 'a', productSlug: 'p', productNaam: 'Product',
  variantLabel: 'M', sku: 'SKU', aantal: 10, gereserveerd: 0, drempel: 5,
  ...over,
});

describe('vrij verkoopbaar', () => {
  it('trekt reserveringen af van wat er ligt', () => {
    expect(vrijVerkoopbaar(rij({ aantal: 10, gereserveerd: 3 }))).toBe(7);
  });

  it('zakt niet onder nul als er meer gereserveerd staat dan er ligt', () => {
    // Kan in theorie niet, maar een negatief getal in de winkel is erger
    // dan een nul.
    expect(vrijVerkoopbaar(rij({ aantal: 2, gereserveerd: 5 }))).toBe(0);
  });
});

describe('staat', () => {
  it('kijkt naar wat vrij is, niet naar wat er ligt', () => {
    // Tien op de plank waarvan negen gereserveerd is voor een klant
    // hetzelfde als één. Juist dan wil je bijbestellen.
    expect(staatVan(rij({ aantal: 10, gereserveerd: 9, drempel: 5 }))).toBe('bijna-op');
    expect(staatVan(rij({ aantal: 10, gereserveerd: 0, drempel: 5 }))).toBe('op-voorraad');
  });

  it('noemt uitverkocht wat volledig gereserveerd is', () => {
    expect(staatVan(rij({ aantal: 4, gereserveerd: 4 }))).toBe('uitverkocht');
    expect(staatVan(rij({ aantal: 0, gereserveerd: 0 }))).toBe('uitverkocht');
  });

  it('rekent de drempel mee als grens, niet als ondergrens', () => {
    expect(staatVan(rij({ aantal: 5, drempel: 5 }))).toBe('bijna-op');
    expect(staatVan(rij({ aantal: 6, drempel: 5 }))).toBe('op-voorraad');
  });
});

describe('sortering', () => {
  it('zet uitverkocht boven bijna-op, en die boven de rest', () => {
    const uit = sorteerVoorraad([
      rij({ variantId: 'ok', aantal: 20, productNaam: 'C' }),
      rij({ variantId: 'op', aantal: 0, productNaam: 'B' }),
      rij({ variantId: 'bijna', aantal: 2, productNaam: 'A' }),
    ]);
    expect(uit.map((r) => r.variantId)).toEqual(['op', 'bijna', 'ok']);
  });

  it('sorteert maten binnen dezelfde staat op een menselijke manier', () => {
    const uit = sorteerVoorraad([
      rij({ variantId: 'b', variantLabel: '42/46' }),
      rij({ variantId: 'a', variantLabel: '36/41' }),
    ]);
    expect(uit.map((r) => r.variantId)).toEqual(['a', 'b']);
  });
});

describe('kerncijfers', () => {
  it('telt varianten, niet stuks, voor de waarschuwingen', () => {
    const k = kerncijfers([
      rij({ aantal: 0 }),
      rij({ aantal: 3, drempel: 5 }),
      rij({ aantal: 40, gereserveerd: 2 }),
    ]);
    expect(k).toEqual({
      varianten: 3, uitverkocht: 1, bijnaOp: 1,
      stuksTotaal: 43, stuksGereserveerd: 2,
    });
  });
});

describe('mutatie lezen', () => {
  it('accepteert een teken en zonder teken', () => {
    expect(leesMutatie('+12')).toBe(12);
    expect(leesMutatie('-1')).toBe(-1);
    expect(leesMutatie('12')).toBe(12);
    expect(leesMutatie('  +7 ')).toBe(7);
  });

  it('weigert nul, want dat is geen wijziging', () => {
    // Zou anders een lege regel in het logboek schrijven.
    expect(leesMutatie('0')).toBeNull();
    expect(leesMutatie('+0')).toBeNull();
    expect(leesMutatie('-0')).toBeNull();
  });

  it('weigert rommel zonder te crashen', () => {
    for (const r of ['', 'twaalf', '1.5', '1,5', '--3', '1e3', '999999', 'NaN', '+', '-']) {
      expect(leesMutatie(r)).toBeNull();
    }
  });
});

describe('mag deze mutatie', () => {
  it('laat gewoon bijboeken en afboeken toe', () => {
    expect(mutatieToegestaan(rij({ aantal: 10, gereserveerd: 0 }), 12).ok).toBe(true);
    expect(mutatieToegestaan(rij({ aantal: 10, gereserveerd: 0 }), -10).ok).toBe(true);
  });

  it('weigert onder nul', () => {
    const uit = mutatieToegestaan(rij({ aantal: 3, gereserveerd: 0 }), -4);
    expect(uit.ok).toBe(false);
    if (!uit.ok) expect(uit.reden).toContain('-1');
  });

  it('weigert afboeken onder wat gereserveerd is', () => {
    // Die stuks zijn aan een bestelling toegezegd. Ze wegboeken betekent dat
    // je een order hebt die je niet meer kunt leveren, en dat merk je pas bij
    // het inpakken.
    const uit = mutatieToegestaan(rij({ aantal: 10, gereserveerd: 4 }), -7);
    expect(uit.ok).toBe(false);
    if (!uit.ok) expect(uit.reden).toContain('4');
  });

  it('staat afboeken tot precies het gereserveerde aantal wel toe', () => {
    expect(mutatieToegestaan(rij({ aantal: 10, gereserveerd: 4 }), -6).ok).toBe(true);
  });
});
