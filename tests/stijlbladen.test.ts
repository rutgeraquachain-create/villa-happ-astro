/**
 * Een component krijgt zijn opmaak uit een stijlblad dat de pagina laadt.
 *
 * GEMETEN 12 SEPTEMBER 2026, OP DE LIVE HOMEPAGE.
 * Het campagneblok van de herinneringsactie (`components/home/Oproep.astro`)
 * stond kaal op villahapp.nl: tekst tegen de linkerrand, geen zwarte balk,
 * standaardtypografie. De opmaak stond in `shop.css`, en `index.astro` laadt
 * alleen `home.css`. Astro bundelt per pagina, dus dat stijlblad bereikte de
 * homepage nooit.
 *
 * Dit gaf geen foutmelding, geen rode toets en geen kapotte build. Het viel op
 * doordat een mens naar de homepage keek, dagen nadat het blok live ging. Op 9
 * september was dezelfde fout al een keer gemaakt, toen op twee
 * nieuwsbriefpagina's.
 *
 * WAT DEZE TOETS WEL EN NIET DOET
 * Hij leest de klassen uit de componenten van de homepage en zoekt ze op in de
 * stijlbladen die de homepage werkelijk importeert. Hij kent geen cascade en
 * geen media-queries; hij toetst of de klasse ergens als selector voorkomt. Dat
 * is genoeg voor deze fout, want die is binair: de regel is er, of hij is er
 * nergens.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

/**
 * De stijlbladen die de homepage laadt. Afgeleid uit de importregels zelf, niet
 * uit een lijst die iemand bijhoudt: `Base.astro` draagt de gedeelde bladen en
 * `index.astro` het eigen blad van de pagina.
 */
function stijlbladenVanDeHomepage(): string[] {
  const bronnen = ['src/layouts/Base.astro', 'src/pages/index.astro'];
  const paden = new Set<string>();
  for (const bron of bronnen) {
    for (const m of lees(bron).matchAll(/import\s+'(?:\.\.?\/)+styles\/([a-z-]+\.css)'/g)) {
      paden.add(`src/styles/${m[1]}`);
    }
  }
  return [...paden];
}

const CSS = stijlbladenVanDeHomepage().map(lees).join('\n');

/**
 * Elke `vh-`-klasse die de componenten van de homepage in hun markup zetten,
 * met de opmaak die het component zelf meebrengt.
 *
 * Dat laatste hoort erbij: een Astro-component mag zijn eigen `<style>`-blok
 * hebben, en dat gaat vanzelf mee naar elke pagina die het component gebruikt.
 * De eerste versie van deze toets keek daar niet naar en zette `vh-brands-sub`
 * uit `Brands.astro` ten onrechte op rood. Een toets die goede code afkeurt,
 * wordt genegeerd, en dan vangt hij de echte fout ook niet meer.
 */
function klassenVanDeHomepage(): { klasse: string; bestand: string; eigenCss: string }[] {
  const map = new URL('../src/components/home/', import.meta.url);
  const uit: { klasse: string; bestand: string; eigenCss: string }[] = [];
  for (const naam of readdirSync(map)) {
    if (!naam.endsWith('.astro')) continue;
    const bron = readFileSync(new URL(naam, map), 'utf-8');
    const eigenCss = [...bron.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    for (const m of bron.matchAll(/class=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      for (const klasse of (m[1] ?? m[2] ?? '').split(/\s+/)) {
        // Alleen kale klassenamen; een `${...}` in een sjabloon is geen naam.
        if (/^vh-[a-z0-9-]+$/.test(klasse)) uit.push({ klasse, bestand: naam, eigenCss });
      }
    }
  }
  return uit;
}

describe('de homepage laadt de opmaak van zijn eigen componenten', () => {
  const klassen = klassenVanDeHomepage();
  const uniek = [...new Map(klassen.map((k) => [k.klasse, k])).values()];

  it('vindt klassen en stijlbladen, anders bewijst deze toets niets', () => {
    // `it.each([])` draait nul keer en meldt groen. Een hernoemde map of een
    // gewijzigde importregel zou de hele controle stil uitzetten.
    expect(stijlbladenVanDeHomepage().length).toBeGreaterThanOrEqual(3);
    expect(uniek.length).toBeGreaterThan(30);
    expect(uniek.map((k) => k.klasse)).toContain('vh-oproep');
  });

  it.each(uniek.map((k) => [k.klasse, k.bestand, k.eigenCss] as const))(
    '%s (uit %s) heeft een regel die met de homepage meekomt',
    (klasse, _bestand, eigenCss) => {
      // Als selector, dus met een punt ervoor en zonder dat er een langere naam
      // achteraan komt: `.vh-oproep` mag niet matchen op `.vh-oproepje`.
      const selector = new RegExp(`\\.${klasse}(?![\\w-])`);
      const gevonden = selector.test(CSS) || selector.test(eigenCss);
      expect(
        gevonden,
        `${klasse} staat in de markup van de homepage, maar in geen stijlblad dat die pagina laadt en ook niet in het eigen style-blok van het component`,
      ).toBe(true);
    },
  );
});
