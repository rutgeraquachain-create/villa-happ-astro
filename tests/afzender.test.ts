/**
 * Welke mail van welk adres komt.
 *
 * Aanleiding: op 2 september 2026 kwam er een tweede postbus bij,
 * `bestellingen@villahapp.nl`. Onder elke bestelbevestiging staat "Antwoord
 * gewoon op deze mail", dus de afzender bepaalt waar klantvragen over een
 * bestelling landen. Zit een soort in de verkeerde groep, dan verdwijnen die
 * antwoorden in een postbus waar niemand ze zoekt, en dat is stille schade.
 *
 * Deze test bewaakt de indeling zelf, niet de adressen: die komen uit
 * business.ts en mogen daar wijzigen zonder dat hier iets breekt.
 */

import { describe, it, expect } from 'vitest';
import { afzenderVoor } from '../src/lib/mail';
import { BUSINESS } from '../src/lib/business';

/**
 * De niet-orderafzender komt uit `MAIL_FROM` in de omgeving, en die verschilt
 * per machine. Deze tests toetsen daarom de indeling en niet de letterlijke
 * waarde: bevat de afzender het orderadres, ja of nee. Een eerdere versie zette
 * MAIL_FROM met `vi.stubEnv`, en dat deed niets: de waarde ligt vast op het
 * moment dat de module geladen wordt.
 */
const ORDERPOSTBUS = [
  'orderbevestiging',
  'verzendbevestiging',
  'terugbetaling',
  'winkelier-nieuwe-order',
];

const ELDERS = [
  'nieuwsbrief-bevestiging',
  'mailing:2026-09-eerste-groet',
  'contactformulier',
  'mail-alarm',
  // Een soort die nog niet bestaat. Vergeten in te delen hoort bij contact uit
  // te komen, waar iemand meekijkt, en niet stilzwijgend als orderpost te gelden.
  'iets-dat-later-bijkomt',
];

describe('afzender per mailsoort', () => {
  it.each(ORDERPOSTBUS)('%s komt van het orderadres', (soort) => {
    expect(afzenderVoor(soort)).toContain(BUSINESS.orderEmail);
  });

  it.each(ELDERS)('%s komt niet van het orderadres', (soort) => {
    expect(afzenderVoor(soort)).not.toContain(BUSINESS.orderEmail);
  });

  it('geeft de twee groepen een verschillende afzender', () => {
    // De hele splitsing bestaat hiervoor. Zou iemand beide velden op hetzelfde
    // adres zetten, dan is er niets meer gesplitst en moet dat opvallen.
    expect(afzenderVoor('orderbevestiging')).not.toBe(afzenderVoor('nieuwsbrief-bevestiging'));
    expect(BUSINESS.orderEmail).not.toBe(BUSINESS.supportEmail);
  });

  it('draagt een weergavenaam en niet alleen een adres', () => {
    // In de inbox leest men de naam. Een kaal adres oogt als een robot.
    expect(afzenderVoor('orderbevestiging')).toMatch(/^Villa Happ <.+@.+>$/);
    expect(afzenderVoor('nieuwsbrief-bevestiging')).toMatch(/^Villa Happ <.+@.+>$/);
  });
});
