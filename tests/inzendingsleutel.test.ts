/**
 * De wachtrijsleutel van een inzendbevestiging mag niet hergebruikt kunnen
 * worden.
 *
 * Gemeten 9 september 2026. De sleutel was `herinnering:<nummer>`. Bij het
 * opruimen van de botinzendingen zijn die rijen verwijderd en is de nummerreeks
 * teruggezet, terwijl de wachtrijrijen met hun sleutel bleven staan. De nummers
 * HH-2026-0002 tot en met 0008 werden opnieuw uitgegeven, elke sleutel botste,
 * en de bevestigingsmail verdween met een 409.
 *
 * Er kwam geen enkel signaal bij. De inzending werd vastgelegd, de deelnemer
 * kreeg zijn nummer op het scherm, en de mail bestond nooit. Zichtbaar alleen in
 * de Supabase-logs, en alleen als je er speciaal naar zocht.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inzendingSleutel } from '../src/lib/herinnering';

const ROUTE = readFileSync(new URL('../src/pages/api/herinnering.ts', import.meta.url), 'utf-8');

describe('de sleutel van een inzendbevestiging', () => {
  it('gebruikt de id van de rij, want die komt na een verwijdering nooit terug', () => {
    expect(inzendingSleutel('7a1e0c56-0000-0000-0000-000000000001', 'HH-2026-0002'))
      .toBe('herinnering:7a1e0c56-0000-0000-0000-000000000001');
  });

  it('bevat het nummer niet, want dat kan opnieuw uitgegeven worden', () => {
    const sleutel = inzendingSleutel('7a1e0c56-0000-0000-0000-000000000001', 'HH-2026-0002');
    expect(sleutel).not.toContain('HH-2026-0002');
  });

  /**
   * Twee inzendingen die hetzelfde nummer krijgen, mogen elkaars mail niet
   * blokkeren. Dat is precies wat er gebeurde.
   */
  it('geeft twee rijen met hetzelfde nummer een verschillende sleutel', () => {
    const a = inzendingSleutel('11111111-1111-1111-1111-111111111111', 'HH-2026-0002');
    const b = inzendingSleutel('22222222-2222-2222-2222-222222222222', 'HH-2026-0002');
    expect(a).not.toBe(b);
  });

  /**
   * Zonder id zou de sleutel `herinnering:undefined` worden en botst elke
   * inzending met elke andere. Dat is stiller en erger dan het oorspronkelijke
   * probleem: dan gaat er nog maar één inzendbevestiging ooit uit.
   */
  it('valt zonder id terug op iets unieks in plaats van op undefined', () => {
    const a = inzendingSleutel(undefined, 'HH-2026-0002');
    expect(a).not.toContain('undefined');
  });

  /**
   * Ook de terugval mag niet botsen. De eerste versie hing aan `Date.now()`, en
   * die telt in milliseconden: twee inzendingen binnen dezelfde milliseconde
   * kregen dezelfde sleutel. Deze toets viel daar op om, en dat is de reden dat
   * de terugval nu een uuid gebruikt.
   */
  it('geeft ook zonder id twee keer een andere sleutel, ook binnen een milliseconde', () => {
    const sleutels = new Set(
      Array.from({ length: 50 }, () => inzendingSleutel(undefined, 'HH-2026-0002')),
    );
    expect(sleutels.size).toBe(50);
  });
});

describe('de route levert de id die de sleutel nodig heeft', () => {
  /**
   * De sleutel is niets waard als de insert de id niet teruggeeft. Dat zijn
   * twee helften in hetzelfde bestand, en de ene kan verdwijnen zonder dat de
   * andere er iets van merkt: hij valt dan stil terug op de tijdstempel.
   */
  it('vraagt de id op bij het wegschrijven van de inzending', () => {
    expect(ROUTE).toMatch(/\.insert\(\{[\s\S]*?\}\)\.select\('id'\)\.single\(\)/);
  });

  it('bouwt de sleutel met de gedeelde functie en niet met de hand', () => {
    expect(ROUTE).toContain('inzendingSleutel(');
    expect(ROUTE).not.toMatch(/dedupeSleutel:\s*`herinnering:\$\{nummer\}`/);
  });
});
