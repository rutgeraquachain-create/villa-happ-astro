/**
 * De herinneringsactie.
 *
 * De zwaarste toets hier is de laatste: dat de actievoorwaarden en de pagina
 * niet beweren dat deelname je aanmeldt voor de nieuwsbrief. Dat is geen
 * stijlkwestie. Toestemming die voorwaarde is voor meedoen geldt als niet vrij
 * gegeven (AVG art. 7 lid 4), en dan is de hele lijst onbruikbaar voor reclame.
 * Precies de lijst waar deze campagne voor bestaat.
 *
 * Zo'n fout sluipt terug via de copy, niet via de code: iemand herschrijft een
 * zin en zet er "door deel te nemen ga je akkoord" in. Vandaar dat de tests op
 * de echte bestanden draaien.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  ACTIE, isGesloten, naamGeldig, herinneringGeldig, nummerGeldig, prijsInEuro,
  woorden, HERINNERING_MIN, HERINNERING_MAX, HERINNERING_MIN_WOORDEN,
} from '../src/lib/herinnering';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

describe('sluiting van de actie', () => {
  it('sluit om middernacht Nederlandse tijd en niet twee uur eerder', () => {
    // 11 oktober 2026 om 23:30 in Nederland is 21:30 UTC. Wie op dat moment
    // inzendt hoort mee te doen. Met een kale middernacht in UTC zou dat net
    // niet meer kunnen, en dat merkt precies de laatste inzender.
    expect(isGesloten(new Date('2026-10-11T21:30:00Z'))).toBe(false);
    expect(isGesloten(new Date('2026-10-11T22:30:00Z'))).toBe(true);
  });

  it('staat open op een gewone dag ervoor', () => {
    expect(isGesloten(new Date('2026-09-20T12:00:00Z'))).toBe(false);
  });
});

describe('wat er ingevuld mag worden', () => {
  it('laat namen door die niet op een woordenboek staan', () => {
    for (const naam of ['Ó Briain', "D'Angelo", 'van der Aa', 'Jo']) {
      expect(naamGeldig(naam)).toBe(true);
    }
  });

  it('weigert een leeg of belachelijk lang naamveld', () => {
    expect(naamGeldig('')).toBe(false);
    expect(naamGeldig('   ')).toBe(false);
    expect(naamGeldig('A')).toBe(false);
    expect(naamGeldig('x'.repeat(81))).toBe(false);
  });

  it('laat een korte maar echte herinnering door', () => {
    expect(herinneringGeldig('Ik kreeg er mijn eerste winterjas.')).toBe(true);
    expect(herinneringGeldig('Mijn moeder kocht daar alles.')).toBe(true);
  });

  it('weigert een lege inzending, ook eentje met alleen spaties', () => {
    expect(herinneringGeldig('')).toBe(false);
    expect(herinneringGeldig(' '.repeat(40))).toBe(false);
    expect(herinneringGeldig('x'.repeat(HERINNERING_MIN - 1))).toBe(false);
    expect(herinneringGeldig('x'.repeat(HERINNERING_MAX + 1))).toBe(false);
  });

  /**
   * De echte invoer van de acht botinzendingen van 8 september 2026. Alle acht
   * kwamen langs de lengtegrens van vijftien tekens, want ze waren zestien tot
   * vierentwintig tekens lang. Geen ervan bevatte een spatie.
   *
   * Dit is de toets die de misser vastlegt: lengte zegt niets over of er taal
   * staat. Verlaag `HERINNERING_MIN_WOORDEN` niet zonder hier langs te gaan.
   */
  it('weigert de tekst die de bots werkelijk instuurden', () => {
    const echt = [
      'ihmgccURCSwmoMWmAjGIpzMi',
      'KhhpwdXEmSQnnOdxvwyGl',
      'ULEcGcJwVVxWwzyMA',
      'LhorJPUyjbNbAQZJD',
      'cSptweeAKQaewuMSarSNVAf',
      'twfYueCXJcHpSRQZl',
      'jNimALVqRMPLuyoAGsEZbcVx',
      'vobMhiMFmGlIhKPA',
    ];
    for (const rommel of echt) {
      // Ze halen de lengtegrens wel, en dat is precies waarom die niet volstond.
      expect(rommel.length).toBeGreaterThanOrEqual(HERINNERING_MIN);
      expect(herinneringGeldig(rommel)).toBe(false);
    }
  });

  it('telt woorden en niet spaties', () => {
    expect(woorden('  een   twee \n drie \t vier  ')).toBe(4);
    expect(woorden('eenwoord')).toBe(1);
    expect(woorden('   ')).toBe(0);
  });

  it('laat drie woorden niet door en vier wel', () => {
    expect(woorden('drie losse woordjes')).toBe(3);
    expect(herinneringGeldig('drie losse woordjes hier')).toBe(true);
    expect(herinneringGeldig('een twee drie vierenveertig')).toBe(true);
  });
});

describe('het inzendnummer', () => {
  it('herkent de vorm die de database maakt', () => {
    expect(nummerGeldig('HH-2026-0001')).toBe(true);
    expect(nummerGeldig('HH-2026-1234')).toBe(true);
  });

  /**
   * Dit nummer is de enige koppeling tussen de rij in de database en de foto
   * die los in het postvak belandt. Glipt er iets anders doorheen, dan staat er
   * onzin in de bevestigingsmail en is die inzending niet meer thuis te brengen.
   */
  it('weigert alles wat er alleen op lijkt', () => {
    for (const kapot of ['VH-2026-0001', 'HH-2026-001', 'HH-26-0001', 'hh-2026-0001', '', null, undefined]) {
      expect(nummerGeldig(kapot as string)).toBe(false);
    }
  });
});

describe('de prijs', () => {
  it('leest als een Nederlands bedrag', () => {
    expect(prijsInEuro()).toBe('€ 75,00');
  });

  it('komt uit één bron, zodat pagina en voorwaarden niet uiteenlopen', () => {
    const voorwaarden = lees('src/pages/actievoorwaarden.astro');
    const pagina = lees('src/pages/herinnering.astro');
    // Beide halen het bedrag op met prijsInEuro(); geen van beide typt het over.
    expect(voorwaarden).toContain('prijsInEuro');
    expect(pagina).toContain('prijsInEuro');
    expect(voorwaarden).not.toMatch(/€\s?75/);
    expect(pagina).not.toMatch(/€\s?75/);
  });
});

describe('de toestemmingen op het formulier', () => {
  const pagina = lees('src/pages/herinnering.astro');

  it('heeft drie losse vakjes', () => {
    for (const naam of ['nieuwsbrief', 'magArchief', 'magNaam']) {
      expect(pagina).toContain(`name="${naam}"`);
    }
  });

  /**
   * Een vooraf aangevinkt vakje is geen toestemming: die vraagt een actieve
   * handeling (AVG art. 4 lid 11, en het Hof in Planet49). Dit is één woord in
   * de HTML, dus het is ook één woord om er per ongeluk bij te zetten.
   */
  it('vinkt er geen enkele vooraf aan', () => {
    const vakjes = pagina.match(/<input[^>]*type="checkbox"[^>]*>/g) || [];
    expect(vakjes.length).toBe(3);
    for (const v of vakjes) expect(v).not.toContain('checked');
  });

  it('maakt geen van de drie verplicht', () => {
    const vakjes = pagina.match(/<input[^>]*type="checkbox"[^>]*>/g) || [];
    for (const v of vakjes) expect(v).not.toContain('required');
  });
});

describe('de actievoorwaarden beloven geen koppeling', () => {
  const voorwaarden = lees('src/pages/actievoorwaarden.astro');

  /**
   * De formulering die dit kapot maakt is een variant op "door deel te nemen
   * ga je akkoord met de nieuwsbrief". Die zin is verleidelijk om te schrijven
   * en fataal voor de bruikbaarheid van de lijst.
   */
  it('zegt nergens dat deelname een inschrijving inhoudt', () => {
    const verdacht = [
      /door\s+deel(name|\s*te\s*nemen)[^.]{0,120}(nieuwsbrief|aangemeld|ingeschreven)/i,
      /automatisch\s+(aangemeld|ingeschreven)/i,
      /ga\s+je\s+akkoord[^.]{0,80}nieuwsbrief/i,
    ];
    for (const patroon of verdacht) {
      expect(voorwaarden).not.toMatch(patroon);
    }
  });

  it('zegt uitdrukkelijk dat het los staat', () => {
    expect(voorwaarden).toMatch(/meedoen aan deze actie meldt je <b>niet<\/b> aan voor de nieuwsbrief/i);
  });

  it('noemt het adres waar de foto heen moet, uit dezelfde bron als de mail', () => {
    expect(voorwaarden).toContain('ACTIE.fotoAdres');
    expect(ACTIE.fotoAdres).toContain('@villahapp.nl');
  });
});
