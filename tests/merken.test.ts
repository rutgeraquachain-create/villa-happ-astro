/**
 * Andere merken (VH_APProved): producten die Villa Happ verkoopt maar niet
 * maakt, met een merkpagina onder /brands.
 *
 * Drie dingen die makkelijk stil misgaan.
 *
 * 1. Een merkproduct dat alsnog als Villa Happ-stuk wordt gepresenteerd. De
 *    productpagina had vaste zinnen ("ontworpen in Waalwijk, van zwaar
 *    biologisch katoen", merk Villa Happ in het schema) die voor een fles van
 *    VANN onwaar zijn. De pagina kiest die op `merk`.
 *
 * 2. Een merk op een product zonder vermelding in src/lib/merken.ts. Dan is
 *    er geen logo, geen merkpagina, en wijst het kruimelpad naar een 404. De
 *    build breekt daar al op (`vindMerk`); deze toets vangt het eerder.
 *
 * 3. Demo-data die afwijkt van de database. CI bouwt zonder sleutels en ziet
 *    alleen demo-products.ts. Staat een beeldpad of SKU daar anders dan in de
 *    migratie, dan bewijst een groene build niets over de echte pagina. Dat
 *    is met de sokken al eens gebeurd (zie CLAUDE.md).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DEMO_PRODUCTS } from '../src/lib/demo-products';
import { kiestOpKleur } from '../src/lib/keuze';
import { MERKEN, merkenMetProduct, vindMerk, zoekMerk } from '../src/lib/merken';

const merkproducten = DEMO_PRODUCTS.filter((p) => p.merk);
const migratie = readFileSync(
  new URL('../supabase/migrations/20260918_goods_en_merken.sql', import.meta.url),
  'utf-8',
);
const migratieV2 = readFileSync(
  new URL('../supabase/migrations/20260918_vann_beelden_v2.sql', import.meta.url),
  'utf-8',
);
const bestaat = (pad: string) => existsSync(new URL(`../public${pad}`, import.meta.url));

describe('producten van andere merken', () => {
  it('er is er minstens één, anders toetst de rest niets', () => {
    expect(merkproducten.length).toBeGreaterThan(0);
  });

  it.each(merkproducten.map((p) => [p.slug, p] as const))('%s heeft een merk dat niet Villa Happ is', (_, p) => {
    expect(p.merk).not.toMatch(/villa\s*happ/i);
  });

  it.each(merkproducten.map((p) => [p.slug, p] as const))('%s staat in merken.ts', (_, p) => {
    expect(zoekMerk(p.merk), `Merk "${p.merk}" ontbreekt in src/lib/merken.ts.`).toBeTruthy();
  });

  it.each(merkproducten.map((p) => [p.slug, p] as const))('%s claimt geen Villa Happ-maakwerk', (_, p) => {
    const tekst = [p.short_desc, p.description, p.note, ...p.details].join(' ');
    expect(tekst).not.toMatch(/biologisch katoen|ontworpen in waalwijk|genummerd|oplage/i);
  });
});

describe('merken.ts', () => {
  it.each(MERKEN.map((m) => [m.naam, m] as const))('%s heeft een geldige slug en een logo dat bestaat', (_, m) => {
    expect(m.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(bestaat(m.logo), `Ontbreekt: public${m.logo}`).toBe(true);
    expect(m.logoMaat.breedte).toBeGreaterThan(0);
    expect(m.logoMaat.hoogte).toBeGreaterThan(0);
  });

  it('heeft geen dubbele slugs of namen', () => {
    expect(new Set(MERKEN.map((m) => m.slug)).size).toBe(MERKEN.length);
    expect(new Set(MERKEN.map((m) => m.naam.toLowerCase())).size).toBe(MERKEN.length);
  });

  it.each(MERKEN.map((m) => [m.naam, m] as const))('%s: teksten zonder em-dash', (_, m) => {
    for (const tekst of [...m.omschrijving, m.waarom]) expect(tekst).not.toContain('—');
  });

  it('een onbekend merk breekt, een bekend merk niet, hoofdletters maken niet uit', () => {
    expect(() => vindMerk('Bestaat Niet')).toThrow(/merken\.ts/);
    expect(vindMerk('vann').slug).toBe('vann');
  });

  it('toont alleen merken waarvan een product in de catalogus staat', () => {
    expect(merkenMetProduct([]).length).toBe(0);
    expect(merkenMetProduct([{ merk: 'VANN' }]).map((m) => m.slug)).toEqual(['vann']);
    expect(merkenMetProduct([{}, { merk: undefined }]).length).toBe(0);
  });
});

describe('VANN-fles: demo-data, migratie en bestanden', () => {
  const fles = DEMO_PRODUCTS.find((p) => p.slug === 'vann-ultimate-bottle-650')!;

  it('staat in de demo-catalogus als kleurkeuze', () => {
    expect(fles).toBeTruthy();
    expect(kiestOpKleur(fles.variants)).toBe(true);
  });

  it('voert dezelfde teksten als de migratie', () => {
    for (const tekst of [fles.name, fles.short_desc, fles.description, fles.meta, fles.note!, ...fles.details]) {
      expect(migratie, `Staat niet in de migratie: ${tekst}`).toContain(tekst.replace(/'/g, "''"));
    }
    expect(migratie).toContain(`${fles.price_cents},`);
  });

  /**
   * De eerste migratie zette de beelden op wit neer; 20260918_vann_beelden_v2.sql
   * maakt van elk pad `<naam>-v2.webp`. De demo-data moet op de uitkomst van die
   * twee samen staan, dus: elk demo-pad is een pad uit de eerste migratie met -v2.
   */
  const naV2 = (pad: string) => pad.replace(/-v2\.webp$/, '.webp');

  it('voert dezelfde SKU-nummers, kleuren en beelden als de migraties', () => {
    for (const v of fles.variants) {
      expect(migratie).toContain(`'${v.sku}'`);
      expect(migratie).toContain(`'${v.color}'`);
      expect(migratie).toContain(`'${v.colorHex}'`);
      expect(v.image).toMatch(/-v2\.webp$/);
      expect(migratie).toContain(`'${naV2(v.image!)}'`);
    }
    for (const beeld of fles.images) {
      expect(beeld).toMatch(/-v2\.webp$/);
      expect(migratie).toContain(naV2(beeld));
    }
    expect(migratieV2).toMatch(/replace\(image_url, '\.webp', '-v2\.webp'\)/);
  });

  /**
   * Een beeld vervang je nooit op hetzelfde pad (CLAUDE.md): de oude paden
   * staan een jaar in caches en misschien in Google Afbeeldingen. Elk oud pad
   * hoort met een 301 naar zijn -v2-versie te gaan.
   */
  it('stuurt elk oud beeldpad met een 301 door naar de -v2-versie', () => {
    const redirects: { source: string; destination: string; permanent?: boolean }[] =
      JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8')).redirects;
    for (const beeld of fles.images) {
      const regel = redirects.find((r) => r.source === naV2(beeld));
      expect(regel, `Geen redirect voor ${naV2(beeld)}`).toBeTruthy();
      expect(regel!.destination).toBe(beeld);
      expect(regel!.permanent).toBe(true);
      expect(bestaat(naV2(beeld)), `${naV2(beeld)} staat er nog; de 301 kan dan niet werken`).toBe(false);
    }
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
