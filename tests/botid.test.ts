/**
 * BotID heeft twee helften, en ze moeten precies gelijk lopen.
 *
 * De client hangt aan elk verzoek naar een pad uit `BOTID_PADEN` een kenmerk;
 * de route controleert dat kenmerk met `checkBotId()`. De documentatie van
 * Vercel is er expliciet over: staat een route niet in de clientlijst, dan
 * faalt `checkBotId()` daar. Het gevolg is dus niet "geen bescherming" maar
 * "elke echte bezoeker krijgt een 403", en dat is de duurdere kant op.
 *
 * Deze toets bestaat omdat we deze week twee keer dezelfde fout maakten: een
 * controle waarvan de andere helft in een ander bestand stond en ontbrak. Zie
 * `tests/formulierpost.test.ts` en `tests/opmaak-import.test.ts`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { BOTID_PADEN } from '../src/lib/botid-routes';

const API = new URL('../src/pages/api/', import.meta.url);
const BASE = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf-8');

/** Alle .ts-bestanden onder src/pages/api/, recursief. */
function routes(map = API, prefix = ''): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = new URL(naam, map);
    if (statSync(pad).isDirectory()) {
      uit.push(...routes(new URL(naam + '/', map), prefix + naam + '/'));
    } else if (naam.endsWith('.ts')) {
      uit.push(prefix + naam);
    }
  }
  return uit;
}

const bestanden = routes().map((r) => ({
  pad: r,
  url: '/api/' + r.replace(/\.ts$/, ''),
  bron: readFileSync(new URL(r, API), 'utf-8'),
}));

const metCheck = bestanden.filter((b) => b.bron.includes('checkBotId('));

describe('de twee helften van BotID', () => {
  it('heeft een lijst, anders bewijst deze suite niets', () => {
    expect(BOTID_PADEN.length).toBeGreaterThan(0);
    expect(metCheck.length).toBeGreaterThan(0);
  });

  it.each(BOTID_PADEN)('$path wordt ook echt op de server gecontroleerd', ({ path }) => {
    const route = bestanden.find((b) => b.url === path);
    expect(route, `${path} bestaat niet als route`).toBeDefined();
    expect(route!.bron, `${path} staat in de clientlijst maar roept checkBotId() niet aan`)
      .toContain('checkBotId(');
  });

  /**
   * De andere kant op, en dit is de gevaarlijke: een route die controleert
   * terwijl de client er geen kenmerk aan hangt, weigert iedereen.
   */
  it.each(metCheck.map((b) => b.url))('%s staat ook in de clientlijst', (url) => {
    const paden = BOTID_PADEN.map((p) => p.path);
    expect(paden, `${url} roept checkBotId() aan maar staat niet in BOTID_PADEN`).toContain(url);
  });

  it('laadt de clientlijst in de layout die elke pagina gebruikt', () => {
    expect(BASE).toContain('initBotId');
    expect(BASE).toContain('BOTID_PADEN');
  });
});

describe('de omleidingen die het script van de eigen site laten komen', () => {
  const vercelJson = JSON.parse(
    readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8'),
  ) as {
    rewrites?: { source: string; destination: string }[];
    headers?: { source: string; headers: { key: string; value: string }[] }[];
  };

  /**
   * Zonder deze twee omleidingen komt het script van een vreemd domein, en dan
   * blokkeert een adblocker het. De bescherming valt dan stil weg: geen fout,
   * geen melding, alleen een controle die niets meer ziet.
   */
  it('stuurt het uitdagingsscript en de proxy door', () => {
    const bronnen = (vercelJson.rewrites ?? []).map((r) => r.source);
    expect(bronnen.some((s) => s.endsWith('/a-4-a/c.js'))).toBe(true);
    expect(bronnen.some((s) => s.endsWith('/:path*'))).toBe(true);
  });

  /**
   * De CSP van deze site is streng en staat op `default-src 'self'`. Het
   * BotID-script komt via de omleiding van onze eigen herkomst, dus `'self'`
   * dekt het. `frame-src` stond er niet op `'self'`, en de installatie vraagt
   * om `X-Frame-Options: SAMEORIGIN` op het BotID-pad, wat op een kader van de
   * eigen herkomst wijst. Zonder deze regel zou dat stil geblokkeerd worden.
   */
  it('laat een kader van de eigen herkomst toe in de CSP', () => {
    const csp = (vercelJson.headers ?? [])
      .flatMap((h) => h.headers)
      .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
    expect(csp, 'er is geen CSP meer').not.toBe('');
    const frameSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-src'));
    expect(frameSrc, "frame-src staat niet op 'self'").toContain("'self'");
  });

  it('zet X-Frame-Options op SAMEORIGIN voor het BotID-pad', () => {
    const blok = (vercelJson.headers ?? []).find((h) => h.source.includes('149e9513'));
    expect(blok, 'geen headerblok voor het BotID-pad').toBeDefined();
    expect(blok!.headers.find((h) => h.key === 'X-Frame-Options')?.value).toBe('SAMEORIGIN');
  });
});
