/**
 * Merkteksten zonder de tekens die ze als machinetaal verraden.
 *
 * Aanleiding, 14 september 2026: op /pers stond het merkverhaal uit
 * `BRAND.narrative` met twee em-dashes en een losse slagzin als eigen alinea
 * ("Villa Happ — voor de dragers van toen."). Dat werd opgemerkt door iemand
 * die de pagina las, niet door een controle. De teksten in `entity.ts` gaan
 * naar het schema, `llms.txt`, de story- en de perspagina, en worden van daaruit
 * overgenomen door zoek- en AI-engines. Een tic die hier staat, verspreidt zich.
 *
 * WAT DEZE TOETS WEL EN NIET DOET
 * Hij toetst twee dingen die objectief vast te stellen zijn: geen em-dash, en
 * geen alinea die zo kort is dat hij alleen een slagzin kan zijn. Of een zin
 * leeg of opgeblazen klinkt, beslist een lezer. Een woordenlijst daarvoor zou
 * goede zinnen afkeuren, en een toets die goede tekst afkeurt wordt uitgezet.
 */

import { describe, it, expect } from 'vitest';
import { BRAND } from '../src/lib/entity';

/** Alle tekst in BRAND, met het veld erbij voor een leesbare melding. */
function merkteksten(): { veld: string; tekst: string }[] {
  const uit: { veld: string; tekst: string }[] = [];
  for (const [veld, waarde] of Object.entries(BRAND)) {
    if (typeof waarde === 'string') uit.push({ veld, tekst: waarde });
    if (Array.isArray(waarde)) {
      waarde.forEach((w, i) => {
        if (typeof w === 'string') uit.push({ veld: `${veld}[${i}]`, tekst: w });
      });
    }
  }
  return uit;
}

describe('merkteksten in entity.ts', () => {
  const teksten = merkteksten();

  it('vindt de teksten, anders bewijst deze toets niets', () => {
    // it.each([]) draait nul keer en meldt groen.
    expect(teksten.length).toBeGreaterThan(10);
    expect(teksten.some((t) => t.veld.startsWith('narrative['))).toBe(true);
  });

  it.each(teksten.map((t) => [t.veld, t.tekst] as const))(
    '%s bevat geen em-dash',
    (veld, tekst) => {
      expect(tekst.includes('—'), `${veld} bevat een em-dash: ${tekst}`).toBe(false);
    },
  );

  it('het merkverhaal heeft geen losse slagzin als alinea', () => {
    /**
     * Een alinea van minder dan honderd tekens is in dit verhaal geen alinea
     * maar een slagzin die als slot is neergezet. De kortste echte alinea
     * telt er ruim driehonderd. De slogan heeft een eigen veld (`slogan`), en
     * daar hoort hij ook.
     */
    for (const [i, alinea] of BRAND.narrative.entries()) {
      expect(alinea.length, `narrative[${i}] is te kort voor een alinea: "${alinea}"`)
        .toBeGreaterThanOrEqual(100);
    }
  });
});
