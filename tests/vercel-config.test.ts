/**
 * vercel.json wordt door Vercel tegen een strikt schema gehouden. Een sleutel
 * die daar niet in staat laat de build meteen falen, nog voordat er iets
 * gebouwd wordt — en dat merk je niet lokaal, want `astro build` leest dit
 * bestand niet.
 *
 * Zo is het ook misgegaan: er stond een uitlegregel "_crons_toelichting" in,
 * bedoeld als commentaar. JSON kent geen commentaar. Elke deploy faalde
 * daarop, terwijl de tests en `astro check` gewoon groen waren.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const config = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf-8'),
);

/** Wat Vercel op het hoogste niveau accepteert en wij daadwerkelijk gebruiken. */
const TOEGESTAAN = new Set([
  'buildCommand', 'cleanUrls', 'crons', 'devCommand', 'framework', 'functions',
  'git', 'headers', 'images', 'installCommand', 'outputDirectory', 'public',
  'redirects', 'regions', 'rewrites', 'routes', 'trailingSlash', 'version',
]);

describe('vercel.json', () => {
  it('bevat geen sleutels die Vercel niet kent', () => {
    const onbekend = Object.keys(config).filter((k) => !TOEGESTAAN.has(k));
    expect(onbekend).toEqual([]);
  });

  it('bevat geen pseudo-commentaar', () => {
    // Een sleutel met een underscore ervoor is bijna altijd een poging om
    // commentaar in JSON te smokkelen. Zet die uitleg in de code ernaast.
    const commentaar = Object.keys(config).filter((k) => k.startsWith('_'));
    expect(commentaar).toEqual([]);
  });

  /**
   * Deze toets stond op de Hobby-grens: minuut en uur moesten vast staan,
   * want vaker dan één keer per dag werd bij het deployen geweigerd. Het
   * project draait sinds september 2026 op Pro, en de cron ging op 9 september
   * naar elk kwartier omdat een driedaagse campagne niet op een dagelijkse
   * taak kan wachten.
   *
   * De toets is daarom niet weggehaald maar verplaatst naar de grens die nu
   * telt: hoe vaak is te vaak. Elke minuut draaien is 1440 aanroepen per dag
   * voor een taak die meestal niets te doen heeft, en dat kost geld zonder dat
   * iemand het merkt. Vijf minuten is de bodem.
   */
  it('laat de cron niet vaker dan eens per vijf minuten draaien', () => {
    const crons = config.crons ?? [];
    // Zonder deze assertie draait de lus nul keer en meldt hij groen, ook als
    // het hele crons-blok per ongeluk uit vercel.json verdwijnt.
    expect(crons.length, 'er staat geen enkele cron in vercel.json').toBeGreaterThan(0);

    for (const cron of crons) {
      const velden = String(cron.schedule).trim().split(/\s+/);
      expect(velden, `cron ${cron.path}: een expressie heeft vijf velden`).toHaveLength(5);

      const [minuut] = velden;
      const stap = /^\*\/(\d+)$/.exec(minuut);
      if (stap) {
        expect(
          Number(stap[1]),
          `cron ${cron.path}: elke ${stap[1]} minuten is te vaak`,
        ).toBeGreaterThanOrEqual(5);
      } else {
        // Geen stap-expressie: dan moet de minuut een vast getal zijn. Een
        // kale `*` betekent elke minuut, en dat is precies wat hier niet mag.
        expect(minuut, `cron ${cron.path}: kale * in de minuut is elke minuut`).toMatch(/^\d+$/);
      }
    }
  });
});
