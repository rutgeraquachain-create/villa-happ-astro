/**
 * De campagnetellers, de fotogrens en de verruimde remmen.
 *
 * Alle drie komen uit de raad van 9 september 2026, en alle drie bewaken ze
 * dezelfde faalvorm: iets dat niet gebeurt zonder dat er een foutmelding bij
 * hoort. Zie `src/lib/campagnestand.ts`.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { beginVanDagNL, vraagtAandacht, type CampagneStand } from '../src/lib/campagnestand';
import {
  MAX_BEVESTIGINGEN_PER_UUR, MAX_INZENDINGEN_PER_UUR, RUSTSTAND_PER_UUR,
  CAMPAGNE_TOT, campagneVenster, MELDING_REM,
} from '../src/lib/aanmeldrem';
import { MAX_BYTES, FOTO_MELDING, MAX_MB_TEKST } from '../src/lib/herinnering-foto';

const BEHEER = readFileSync(new URL('../src/pages/beheer/index.astro', import.meta.url), 'utf-8');
const NIEUWSBRIEF = readFileSync(new URL('../src/pages/api/newsletter.ts', import.meta.url), 'utf-8');

const stand = (over: Partial<CampagneStand> = {}): CampagneStand => ({
  ingezonden: 0, aangemeld: 0, bevestigd: 0, verstuurd: 0, afgeleverd: 0, zonderStempel: 0, ...over,
});

describe('de fotogrens zegt wat de code doet', () => {
  /**
   * Gemeten 9 september 2026. De grens ging op 7 september van 5 naar 4 MB
   * omdat 5 boven de afkapgrens van Vercel lag, en de melding bleef op 5 MB
   * staan. Een foto van 4,5 MB werd dus geweigerd met een tekst die zei dat
   * hij mocht. Daarom is de tekst nu afgeleid en niet apart opgeschreven.
   */
  it('noemt hetzelfde getal als de weigering hanteert', () => {
    const megabyte = MAX_BYTES / (1024 * 1024);
    expect(FOTO_MELDING.groot).toContain(MAX_MB_TEKST);
    expect(FOTO_MELDING.groot).toContain(`${megabyte} MB`);
  });

  /**
   * De tegenproef: zou de melding weer een vast getal krijgen, dan moet deze
   * toets omvallen. Vandaar dat hij een ander getal uitsluit en niet alleen
   * het goede getal zoekt.
   */
  it('noemt geen ander getal', () => {
    const megabyte = MAX_BYTES / (1024 * 1024);
    for (const ander of [1, 2, 3, 5, 6, 8, 10].filter((n) => n !== megabyte)) {
      expect(FOTO_MELDING.groot, `de melding noemt ${ander} MB`).not.toContain(`${ander} MB`);
    }
  });
});

describe('de remmen tijdens de campagne', () => {
  it('staan hoger dan de ruststand', () => {
    expect(MAX_BEVESTIGINGEN_PER_UUR).toBeGreaterThan(RUSTSTAND_PER_UUR);
    expect(MAX_INZENDINGEN_PER_UUR).toBeGreaterThan(RUSTSTAND_PER_UUR);
  });

  /**
   * DE SLUITVOORWAARDE.
   *
   * Een tijdelijk ruimere instelling geeft uit zichzelf geen signaal wanneer
   * hij overbodig wordt: hij blijft staan. Deze toets is dat signaal. Valt hij
   * om, dan is de campagne voorbij en horen de remmen terug naar
   * `RUSTSTAND_PER_UUR` in src/lib/aanmeldrem.ts.
   */
  it('gaan terug naar de ruststand zodra de campagne voorbij is', () => {
    if (campagneVenster()) return;
    expect(
      MAX_BEVESTIGINGEN_PER_UUR,
      `De campagne is voorbij (${CAMPAGNE_TOT.toISOString().slice(0, 10)}). ` +
        `Zet MAX_BEVESTIGINGEN_PER_UUR en MAX_INZENDINGEN_PER_UUR terug op ${RUSTSTAND_PER_UUR}.`,
    ).toBe(RUSTSTAND_PER_UUR);
    expect(MAX_INZENDINGEN_PER_UUR).toBe(RUSTSTAND_PER_UUR);
  });

  it('sluiten een dag na de actie', () => {
    expect(campagneVenster(new Date('2026-10-01T12:00:00Z'))).toBe(true);
    expect(campagneVenster(new Date('2026-10-20T12:00:00Z'))).toBe(false);
  });

  /**
   * Tot 9 september kreeg een bezoeker bij een volle rem exact hetzelfde
   * antwoord als iemand van wie de mail wél uitging, en dan zoekt hij in zijn
   * postvak naar iets wat er niet is.
   */
  it('vertellen de bezoeker dat er geen mail uitgaat', () => {
    expect(NIEUWSBRIEF).toContain('MELDING_REM');
    expect(MELDING_REM).toMatch(/bevestigingsmail/i);
    // Geen valse belofte: de mail wordt niet alsnog in de wachtrij gezet, dus
    // de tekst mag niet zeggen dat hij onderweg is.
    expect(MELDING_REM).not.toMatch(/onderweg|is verstuurd/i);
  });
});

describe('de dag begint in Nederland en niet op de server', () => {
  /**
   * Vercel draait op UTC. Met `setHours(0,0,0,0)` zou "vandaag" tussen 00:00 en
   * 02:00 Nederlandse tijd de vorige dag zijn, en dat is precies het uur waarop
   * iemand na een avondpost gaat kijken hoe het loopt.
   */
  it('rekent 00:30 Nederlandse tijd tot vandaag', () => {
    // 2026-10-09 00:30 in Nederland is 2026-10-08 22:30 UTC (zomertijd).
    const nu = new Date('2026-10-08T22:30:00.000Z');
    const begin = beginVanDagNL(nu);
    // Middernacht in Nederland op die dag is 22:00 UTC de dag ervoor.
    expect(begin.toISOString()).toBe('2026-10-08T22:00:00.000Z');
    expect(begin.getTime()).toBeLessThan(nu.getTime());
  });

  it('ligt nooit in de toekomst', () => {
    const nu = new Date('2026-10-09T14:12:34.567Z');
    expect(beginVanDagNL(nu).getTime()).toBeLessThanOrEqual(nu.getTime());
  });
});

describe('wanneer de stand aandacht vraagt', () => {
  it('meldt niets als er niets gebeurd is', () => {
    expect(vraagtAandacht(stand())).toBe(false);
  });

  it('meldt inzendingen zonder afgeleverde mail', () => {
    expect(vraagtAandacht(stand({ ingezonden: 3, verstuurd: 3, afgeleverd: 0 }))).toBe(true);
  });

  it('meldt aanmeldingen die niemand bevestigt', () => {
    expect(vraagtAandacht(stand({ aangemeld: 8, bevestigd: 0 }))).toBe(true);
  });

  it('zwijgt als alles rondloopt', () => {
    expect(vraagtAandacht(stand({
      ingezonden: 3, aangemeld: 3, bevestigd: 2, verstuurd: 3, afgeleverd: 3,
    }))).toBe(false);
  });
});

describe('het beheerscherm toont de stand', () => {
  it('zet de drie tellingen naast elkaar', () => {
    expect(BEHEER).toContain('leesCampagneStand');
    for (const woord of ['ingezonden', 'bevestigd', 'afgeleverd volgens Resend']) {
      expect(BEHEER, `de regel noemt ${woord} niet`).toContain(woord);
    }
  });

  /**
   * Een mislukte telling is geen nul. Zou het scherm bij een fout gewoon nul
   * tonen, dan leest dat als "er is niets gebeurd" op het moment dat je juist
   * niets weet.
   */
  it('zegt het als de telling mislukte', () => {
    expect(BEHEER).toContain('Dat is niet hetzelfde als nul');
  });
});
