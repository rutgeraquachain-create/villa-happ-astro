/**
 * Een pagina die opmaakklassen gebruikt, laadt ook het bestand waar ze staan.
 *
 * Gemeten 9 september 2026. `/nieuwsbrief/bevestigen` en `/nieuwsbrief/afmelden`
 * gebruikten allebei `vh-page`, `vh-page-inner`, `vh-page-head` en
 * `vh-page-title`, en importeerden `shop.css` niet. Die klassen staan daar en
 * nergens anders, dus de pagina's kregen geen kader, geen marge en liepen onder
 * de vaste balk door. Elke andere pagina met deze klassen importeerde het
 * bestand wel.
 *
 * Het viel niemand op omdat er geen fout is: de klassen bestaan gewoon niet en
 * de browser slaat ze stil over. Het kwam pas boven water toen iemand op de knop
 * in zijn eigen bevestigingsmail klikte en een kale pagina zag.
 *
 * Dezelfde vorm als `tests/formulierpost.test.ts`: de controle bestaat uit twee
 * helften in twee bestanden, en de helft die je niet leest is de helft die
 * ontbreekt.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const SRC = new URL('../src/', import.meta.url);
const STIJLEN = new URL('../src/styles/', import.meta.url);

/** Alle .astro-bestanden onder src/, recursief. */
function paginas(map = SRC, prefix = ''): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = new URL(naam, map);
    if (statSync(pad).isDirectory()) {
      uit.push(...paginas(new URL(naam + '/', map), prefix + naam + '/'));
    } else if (naam.endsWith('.astro')) {
      uit.push(prefix + naam);
    }
  }
  return uit;
}

/**
 * Klassen die maar in één stijlbestand staan, met dat bestand erbij. Alleen
 * klassen die zonder hun bestand zichtbaar kapot gaan; een kleurtje dat wegvalt
 * merkt niemand, een ontbrekend kader wel.
 */
const KLASSEN: { klasse: string; bestand: string }[] = [
  { klasse: 'vh-page-inner', bestand: 'shop.css' },
  { klasse: 'vh-page-head', bestand: 'shop.css' },
  { klasse: 'vh-page-title', bestand: 'shop.css' },
  { klasse: 'vh-hp', bestand: 'base.css' },
];

/**
 * Stijlbestanden die `Base.astro` zelf laadt en die dus op elke pagina gelden.
 * Een klasse die daarin staat, hoeft nergens apart geimporteerd te worden.
 */
const ALTIJD_GELADEN = readFileSync(new URL('layouts/Base.astro', SRC), 'utf-8');

const bestanden = paginas().map((p) => ({ pad: p, bron: readFileSync(new URL(p, SRC), 'utf-8') }));

describe('opmaakklassen en hun stijlbestand', () => {
  it('leest er überhaupt pagina\'s, anders bewijst dit niets', () => {
    expect(bestanden.length).toBeGreaterThan(20);
  });

  /**
   * De aanname onder deze hele toets: elke klasse hierboven staat in precies
   * één stijlbestand. Verhuist hij, dan wijst de toets naar het verkeerde
   * bestand en meldt hij groen zonder iets te controleren.
   */
  it.each(KLASSEN)('klasse $klasse staat alleen in $bestand', ({ klasse, bestand }) => {
    const treffers = readdirSync(STIJLEN)
      .filter((n) => n.endsWith('.css'))
      .filter((n) => new RegExp(`\\.${klasse}[\\s,{:]`).test(readFileSync(new URL(n, STIJLEN), 'utf-8')));
    expect(treffers).toEqual([bestand]);
  });

  it.each(KLASSEN)('elke pagina met $klasse importeert $bestand', ({ klasse, bestand }) => {
    const gebruikers = bestanden.filter((b) => new RegExp(`class="[^"]*\\b${klasse}\\b`).test(b.bron));
    expect(gebruikers.length, `niemand gebruikt ${klasse}`).toBeGreaterThan(0);

    // Staat het bestand in Base.astro, dan laadt elke pagina het en is er niets
    // per pagina te controleren. Dat is de juiste plek voor een klasse die een
    // component gebruikt die overal staat, zoals de voettekst.
    if (ALTIJD_GELADEN.includes(`styles/${bestand}`)) return;

    for (const { pad, bron } of gebruikers) {
      // Rechtstreeks importeren, of via een omhullende component die dat doet.
      const zelf = bron.includes(`styles/${bestand}`);
      const viaLayout = /import\s+\w*Layout\s+from/.test(bron)
        && bestanden.some((b) => b.pad.includes('Layout') && b.bron.includes(`styles/${bestand}`));
      expect(zelf || viaLayout, `${pad} gebruikt ${klasse} maar laadt ${bestand} niet`).toBe(true);
    }
  });

  /**
   * De voettekst staat op elke pagina. Wat zij gebruikt, hoort dus in een
   * stijlblad dat elke pagina laadt. Deze toets legt dat vast, want anders kan
   * de honeypot-regel later ongemerkt terug naar een stijlblad dat je per
   * pagina moet importeren, en dan staat hij weer zichtbaar op de homepage.
   */
  it('laadt elke pagina de opmaak van de honeypot', () => {
    const voettekst = bestanden.find((b) => b.pad.endsWith('layout/Footer.astro'));
    expect(voettekst?.bron, 'de voettekst gebruikt de honeypot niet meer').toContain('class="vh-hp"');
    expect(ALTIJD_GELADEN, 'Base.astro laadt base.css niet').toContain('styles/base.css');
    const basis = readFileSync(new URL('styles/base.css', SRC), 'utf-8');
    expect(basis, '.vh-hp staat niet in base.css').toMatch(/\.vh-hp\s*\{/);
  });
});
