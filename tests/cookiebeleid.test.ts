/**
 * Het cookiebeleid volgt de code, niet andersom.
 *
 * Gemeten 11 september 2026: de tabel "Wat we lokaal bewaren" noemde
 * `vh_wishlist` en `vh_recent`, terwijl de code `vh_wishlist_v1` en
 * `vh_recent_v1` schreef, en de pagina noemde Google Ads terwijl er geen
 * advertentietag op de site stond. Niemand merkte het, want een cookiebeleid
 * geeft geen foutmelding. Een cookiebeleid dat meer of minder claimt dan er
 * gebeurt, is precies waar een AVG-klacht op landt.
 *
 * Deze toets zoekt elke opslagsleutel op die de code gebruikt en eist dat hij
 * op de pagina staat. Een nieuwe sleutel zonder regel in het beleid valt om.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const COOKIES = readFileSync(new URL('../src/pages/cookies.astro', import.meta.url), 'utf-8');
const PRIVACY = readFileSync(new URL('../src/pages/privacy.astro', import.meta.url), 'utf-8');
const MEETPLAN = readFileSync(new URL('../docs/meetplan.md', import.meta.url), 'utf-8');

/**
 * Sleutels die bewust niet in het beleid staan, elk met een reden. Een sleutel
 * zonder reden hoort hier niet.
 */
const BUITEN_BELEID: Record<string, string> = {
  vh_reviews_: 'Alleen in de demostand zonder database; op productie schrijft de productpagina hem nooit.',
};

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) return bestanden(pad);
    return /\.(ts|astro)$/.test(naam) ? [pad] : [];
  });
}

/** Elke constante die een opslagsleutel draagt: `const KEY = 'vh_…'` en varianten. */
function opslagsleutels(): string[] {
  const gevonden = new Set<string>();
  const patroon = /\b(?:KEY|STORAGE_KEY|SLEUTEL|FORM_KEY|CONSENT_KEY|key)\s*=\s*['`](vh_[A-Za-z0-9_]+)/g;
  for (const pad of bestanden(SRC)) {
    if (pad.endsWith('cookies.astro')) continue;
    for (const m of readFileSync(pad, 'utf-8').matchAll(patroon)) gevonden.add(m[1]);
  }
  return [...gevonden].sort();
}

describe('opslag in de browser', () => {
  const sleutels = opslagsleutels();

  it('vindt sleutels, anders bewijst deze toets niets', () => {
    // `it.each([])` draait nul keer en meldt groen. Een verplaatste map of een
    // hernoemde constante zou de hele controle stil uitzetten.
    expect(sleutels.length).toBeGreaterThanOrEqual(8);
    expect(sleutels).toContain('vh_cart_v1');
  });

  it.each(sleutels.filter((s) => !(s in BUITEN_BELEID)))('%s staat in het cookiebeleid', (sleutel) => {
    expect(COOKIES, `${sleutel} wordt gebruikt maar staat niet in src/pages/cookies.astro`).toContain(`'${sleutel}'`);
  });
});

describe('de cookies van Google', () => {
  it('noemt de twee cookies die GA4 zet', () => {
    expect(COOKIES).toContain('<code>_ga</code>');
  });

  /**
   * De naam van de tweede cookie is het meet-ID zonder `G-`. Wisselt de
   * property ooit, dan staat er anders een cookienaam op de pagina die niemand
   * meer plaatst.
   */
  it('noemt de sessiecookie met het meet-ID uit het meetplan', () => {
    const id = /`(G-[A-Z0-9]+)`/.exec(MEETPLAN)?.[1];
    expect(id, 'geen meet-ID gevonden in docs/meetplan.md').toBeTruthy();
    expect(COOKIES).toContain(`_ga_${id!.slice(2)}`);
  });

  it('belooft geen advertentietag die er niet is', () => {
    // Gemeten in de gepubliceerde container: geen AW-id, geen Ads-tag. Komt
    // die er wel, dan moet deze toets mee, samen met de pagina en een nieuwe
    // toestemmingsvraag.
    expect(COOKIES).not.toContain('Google Ads: meten welke advertentie');
    expect(COOKIES).toContain('er staat geen advertentietag op de site');
  });

  it('staat als verwerker in de privacyverklaring', () => {
    expect(PRIVACY).toMatch(/name:\s*'Google'/);
  });
});
