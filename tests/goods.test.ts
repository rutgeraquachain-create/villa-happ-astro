/**
 * Goods en VH_APProved: producten die Villa Happ verkoopt maar niet maakt.
 *
 * Twee dingen die makkelijk stil misgaan.
 *
 * 1. Een merkproduct dat alsnog als Villa Happ-stuk wordt gepresenteerd. De
 *    productpagina had vaste zinnen ("ontworpen in Waalwijk, van zwaar
 *    biologisch katoen", merk Villa Happ in het schema) die voor een fles van
 *    VANN onwaar zijn. De pagina kiest die nu op `merk`; staat het merk niet
 *    goed in de data, dan komen ze terug.
 *
 * 2. Demo-data die afwijkt van de database. CI bouwt zonder sleutels en ziet
 *    alleen demo-products.ts. Staat een beeldpad of SKU daar anders dan in de
 *    migratie, dan bewijst een groene build niets over de echte pagina. Dat
 *    is met de sokken al eens gebeurd (zie CLAUDE.md).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DEMO_PRODUCTS } from '../src/lib/demo-products';
import { kiestOpKleur } from '../src/lib/keuze';

const goods = DEMO_PRODUCTS.filter((p) => p.collectie === 'goods');
const migratie = readFileSync(
  new URL('../supabase/migrations/20260918_goods_en_merken.sql', import.meta.url),
  'utf-8',
);
const bestaat = (pad: string) => existsSync(new URL(`../public${pad}`, import.meta.url));

describe('Goods-producten', () => {
  it('er is er minstens één, anders toetst de rest niets', () => {
    expect(goods.length).toBeGreaterThan(0);
  });

  it.each(goods.map((p) => [p.slug, p] as const))('%s heeft een merk dat niet Villa Happ is', (_, p) => {
    expect(p.merk, 'Een Goods-product zonder merk krijgt "Villa Happ" in het schema.').toBeTruthy();
    expect(p.merk).not.toMatch(/villa\s*happ/i);
  });

  it.each(goods.map((p) => [p.slug, p] as const))('%s claimt geen Villa Happ-maakwerk', (_, p) => {
    const tekst = [p.short_desc, p.description, p.note, ...p.details].join(' ');
    expect(tekst).not.toMatch(/biologisch katoen|ontworpen in waalwijk|genummerd|oplage/i);
  });
});

describe('VANN-fles: demo-data, migratie en bestanden', () => {
  const fles = DEMO_PRODUCTS.find((p) => p.slug === 'vann-ultimate-bottle-650')!;

  it('staat in de demo-catalogus als kleurkeuze', () => {
    expect(fles).toBeTruthy();
    expect(kiestOpKleur(fles.variants)).toBe(true);
  });

  it('voert dezelfde teksten als de migratie', () => {
    for (const tekst of [fles.name, fles.short_desc, fles.description, fles.merkToelichting!, fles.meta, fles.note!, ...fles.details]) {
      expect(migratie, `Staat niet in de migratie: ${tekst}`).toContain(tekst.replace(/'/g, "''"));
    }
    expect(migratie).toContain(`${fles.price_cents},`);
  });

  it('voert dezelfde SKU-nummers, kleuren en beelden als de migratie', () => {
    for (const v of fles.variants) {
      expect(migratie).toContain(`'${v.sku}'`);
      expect(migratie).toContain(`'${v.color}'`);
      expect(migratie).toContain(`'${v.colorHex}'`);
      expect(migratie).toContain(`'${v.image}'`);
    }
    for (const beeld of fles.images) expect(migratie).toContain(beeld);
  });

  /**
   * Een productfoto heeft twee bestanden: de WebP voor de site en een JPG
   * voor de mail, want Outlook rendert geen WebP. Zonder de JPG staat er een
   * kapot icoontje in de bestelbevestiging.
   */
  it('heeft voor elke foto de WebP en de mail-JPG', () => {
    for (const beeld of fles.images) {
      expect(bestaat(beeld), `Ontbreekt: public${beeld}`).toBe(true);
      const mail = beeld.replace('/img/products/', '/img/mail/').replace(/\.webp$/, '.jpg');
      expect(bestaat(mail), `Ontbreekt: public${mail}. Draai node scripts/mail-assets.mjs.`).toBe(true);
    }
  });
});
