/**
 * `pointer-events` hoort niet in een GSAP-tween.
 *
 * Gemeten 9 september 2026 op villahapp.nl bij 1440 bij 900: `.vh-hero-inner`
 * had `opacity: 1` en `pointer-events: none`, als inline stijl van GSAP, terwijl
 * geen enkele CSS-regel op die eigenschap matchte. Omdat `pointer-events` erft,
 * waren "Shop de collectie" en "Bekijk drops" allebei onklikbaar. De hoofd-CTA
 * van de homepage deed niets.
 *
 * De oorzaak: `pointerEvents: 'none'` stond als eigenschap in de scrub-tween.
 * Dat is geen waarde die je kunt interpoleren, dus GSAP schrijft hem meteen bij
 * de start van de tween in plaats van aan het eind. De bedoeling was dat de
 * weggescrolde hero geen kliks meer vangt; het gevolg was dat hij ze nooit ving.
 *
 * Dezelfde fout stond twee keer in het bestand, in de desktoptak en in de
 * mobiele tak. Vandaar een toets op het patroon en niet op één regel.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
// Uit een eigen bestand: `motion.ts` leest `window` bij het laden en is daardoor
// niet te importeren in een node-toets.
import { zetHeroKlikbaar } from '../src/lib/hero-klik';

const MOTION = readFileSync(new URL('../src/lib/motion.ts', import.meta.url), 'utf-8');
const HOME_CSS = readFileSync(new URL('../src/styles/home.css', import.meta.url), 'utf-8');

/** Een minimaal element met alleen wat `classList.toggle` nodig heeft. */
function nepHero() {
  const klassen = new Set<string>();
  return {
    classList: {
      toggle(naam: string, aan: boolean) { aan ? klassen.add(naam) : klassen.delete(naam); },
      contains: (naam: string) => klassen.has(naam),
    },
  } as unknown as Element & { classList: { contains(n: string): boolean } };
}

describe('de hero vangt kliks zolang hij in beeld staat', () => {
  it('laat kliks door bovenaan de pagina', () => {
    const hero = nepHero();
    zetHeroKlikbaar(hero, 0);
    expect(hero.classList.contains('is-weggescrold')).toBe(false);
  });

  /**
   * De tegenproef. Zonder deze zou een functie die nooit iets doet ook groen
   * geven, en dan is de bescherming weg die we juist wilden houden.
   */
  it('blokkeert kliks zodra de hero is weggescrold', () => {
    const hero = nepHero();
    zetHeroKlikbaar(hero, 0.6);
    expect(hero.classList.contains('is-weggescrold')).toBe(true);
  });

  it('schakelt terug als je weer omhoog scrolt', () => {
    const hero = nepHero();
    zetHeroKlikbaar(hero, 0.6);
    zetHeroKlikbaar(hero, 0);
    expect(hero.classList.contains('is-weggescrold')).toBe(false);
  });

  it('heeft de bijbehorende CSS-regel', () => {
    expect(HOME_CSS).toMatch(/\.vh-hero\.is-weggescrold[^{]*\{[^}]*pointer-events:\s*none/);
  });
});

describe('geen niet-interpoleerbare eigenschappen in een tween', () => {
  /**
   * `pointerEvents`, `display` en `visibility` zijn niet te interpoleren. GSAP
   * zet ze bij de start van de tween, niet aan het eind. In een scrub-tween
   * betekent dat: meteen actief, ook bij voortgang nul. Wie zoiets nodig heeft,
   * doet het via een klasse vanuit `onUpdate`, zoals `zetHeroKlikbaar`.
   */
  /**
   * Geen regex op de tween zelf. Mijn eerste versie knipte de tween op het
   * eerste haakje af, vond `pointerEvents` daardoor niet terug, en meldde groen
   * terwijl de fout er weer in stond. Nagemeten door hem terug te zetten.
   *
   * Dit is grover en daardoor betrouwbaar: `motion.ts` hoort deze namen
   * helemaal niet te bevatten. Wie ze nodig heeft, doet het via een klasse,
   * zoals `zetHeroKlikbaar` in src/lib/hero-klik.ts.
   */
  it.each(['pointerEvents', 'visibility:', 'display:'])('%s komt niet voor in motion.ts', (naam) => {
    expect(MOTION.length, 'motion.ts is leeg; deze toets meet dan niets').toBeGreaterThan(1000);
    expect(MOTION.includes(naam), `${naam} staat in motion.ts en hoort via een klasse te gaan`).toBe(false);
  });
});
