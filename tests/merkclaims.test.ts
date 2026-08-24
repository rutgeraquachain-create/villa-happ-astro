/**
 * Merkclaims die niet mogen verwateren.
 *
 * Aanleiding: "genummerd" is tweemaal aan de hele collectie toegeschreven,
 * terwijl alleen de caps een nummer en een certificaat krijgen. De eerste keer
 * is hersteld in commit ad45d45, daarna kwam het terug in de alt-tekst van het
 * deelbeeld en in de voorraadmail.
 *
 * Waarom een test en geen opmerking in de code: een opmerking waarschuwt
 * alleen wie het bestand toevallig opent. Deze claim verspreidt zich juist
 * naar plekken waar niemand hem verwacht, zoals een og-tag, een transactiemail
 * of een bedrijfsprofiel bij Google. Een test vangt hem waar hij ook opduikt.
 *
 * De regel: zeg je "genummerd" of "gelimiteerd" over het merk als geheel, dan
 * moet in dezelfde adem staan dat het om de caps gaat. Klopt dat niet, dan is
 * het een belofte die de andere producten niet waarmaken.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BRAND } from '../src/lib/entity';
import { renderBackInStock } from '../src/lib/mail';

/**
 * Woorden die schaarste claimen. "beperkte oplage" staat er bewust bij: die
 * kwam erin als correctie op "genummerd" en was net zo onwaar. Hoodies en
 * sokken worden per serie gemaakt en kunnen terugkomen, dus elke belofte over
 * een vast aantal of over "op is op" geldt alleen voor de caps en de drops.
 */
const NUMMERCLAIM = /genummerd|gelimiteerd|limited edition|beperkte oplage/i;
/** De enige productgroep die dat waarmaakt. */
const CAPS = /\bcaps?\b|\bdrops?\b/i;

describe('merkclaims over genummerde oplages', () => {
  it('de merkdefinitie beperkt de nummerclaim tot de caps', () => {
    const tekst = BRAND.definition;
    if (NUMMERCLAIM.test(tekst)) {
      expect(
        CAPS.test(tekst),
        'BRAND.definition claimt een genummerde oplage zonder erbij te zeggen ' +
          'dat het om de caps gaat. Alleen de caps zijn genummerd.',
      ).toBe(true);
    }
  });

  it('de alt-tekst van het deelbeeld claimt geen genummerde collectie', () => {
    expect(
      NUMMERCLAIM.test(BRAND.shareImageAlt),
      'BRAND.shareImageAlt beschrijft het sitebrede deelbeeld en geldt dus ' +
        'voor de hele collectie. Een nummerclaim hoort daar niet in.',
    ).toBe(false);
  });

  it('de voorraadmail claimt geen genummerde oplage', () => {
    // Deze mail gaat naar elk product waarvoor een melding is aangevraagd,
    // dus ook naar hoodies en sokken.
    const { html, subject } = renderBackInStock(
      'Organic Cotton Hoodie Navy',
      'M',
      'https://villahapp.nl/shop/organic-cotton-hoodie-navy',
    );
    expect(NUMMERCLAIM.test(html), 'De voorraadmail claimt een oplage voor elk product.').toBe(false);
    expect(NUMMERCLAIM.test(subject)).toBe(false);
    // Ook zonder het woord "oplage" kun je schaarste beloven.
    expect(/op is (echt )?op|komt (hij |die )?niet terug/i.test(html),
      'De voorraadmail belooft dat het stuk niet terugkomt. Hoodies en sokken kunnen wel terugkomen.').toBe(false);
  });

  it('llms.txt legt het onderscheid tussen caps en de rest uit', async () => {
    // Dit bestand instrueert AI-modellen expliciet. Staat het onderscheid hier
    // niet in, dan nemen ze de schaarsteclaim over voor de hele collectie.
    const mod = await import('../src/pages/llms.txt.ts');
    const res = await (mod.GET as any)({ url: new URL('https://villahapp.nl/llms.txt') });
    const tekst = await res.text();
    expect(/alleen de caps/i.test(tekst), 'llms.txt zegt niet dat alleen de caps genummerd zijn.').toBe(true);
    expect(/zolang de voorraad strekt/i.test(tekst),
      'llms.txt geeft geen formulering voor de producten zonder oplage.').toBe(true);
  });

  it('de standaardomschrijving van de layout blijft binnen de belofte', () => {
    // Base.astro is geen module die we kunnen importeren, dus lezen we hem als
    // tekst. Bewust alleen de standaardwaarden bovenin: de rest van het bestand
    // bevat legitieme verwijzingen naar drops.
    const bron = readFileSync(new URL('../src/layouts/Base.astro', import.meta.url), 'utf-8');
    const regels = bron.split('\n').filter((r) => /^\s*(title|description)\s*=/.test(r));
    expect(regels.length, 'De standaardwaarden title en description zijn niet gevonden in Base.astro.').toBeGreaterThan(0);
    for (const regel of regels) {
      if (NUMMERCLAIM.test(regel)) {
        expect(
          /drops?/i.test(regel) || CAPS.test(regel),
          `Deze standaardtekst geldt sitebreed en claimt een oplage: ${regel.trim()}`,
        ).toBe(true);
      }
    }
  });
});
