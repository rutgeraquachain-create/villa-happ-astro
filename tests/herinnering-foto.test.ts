/**
 * De foto bij een herinnering.
 *
 * Twee dingen kunnen hier stil fout gaan. Een pad dat uit de bestandsnaam van de
 * bezoeker komt laat hem kiezen waar zijn bestand belandt, en een foto die in de
 * verkeerde bucket of op een raadbare URL staat publiceert het beeld van iemand
 * die daar uitdrukkelijk nee tegen zei.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  keurFoto, FOTO_MELDING, fotoPad, leesbareGrootte, MAX_BYTES, TOEGESTANE_TYPES,
} from '../src/lib/herinnering-foto';
import { sorteer, kerncijfers, isStatus, STATUSSEN, type Inzending } from '../src/lib/herinnering-beheer';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

describe('welke bestanden erdoor mogen', () => {
  it('laat de drie formaten door die het beheerscherm kan tonen', () => {
    for (const type of TOEGESTANE_TYPES) {
      expect(keurFoto(type, 500_000)).toBe('geen');
    }
  });

  /**
   * HEIC staat er bewust niet bij, ook al maakt elke iPhone het. De browser zet
   * het bij het verkleinen om naar JPEG. Zou het hier wel doorgelaten worden,
   * dan belandt er een bestand in de opslag dat het beheerscherm niet kan tonen
   * en lijkt de inzending leeg.
   */
  it('weigert wat de browser niet kan tonen', () => {
    expect(keurFoto('image/heic', 500_000)).toBe('type');
    expect(keurFoto('application/pdf', 500_000)).toBe('type');
    expect(keurFoto('text/html', 500)).toBe('type');
  });

  it('weigert een leeg bestand en een te groot bestand', () => {
    expect(keurFoto('image/jpeg', 0)).toBe('leeg');
    expect(keurFoto('image/jpeg', MAX_BYTES + 1)).toBe('groot');
    expect(keurFoto('image/jpeg', MAX_BYTES)).toBe('geen');
  });

  it('heeft voor elke afkeuring een Nederlandse melding', () => {
    for (const soort of ['type', 'groot', 'leeg'] as const) {
      expect(FOTO_MELDING[soort]).toMatch(/[a-z]/);
      expect(FOTO_MELDING[soort]).not.toMatch(/invalid|error|failed/i);
    }
  });
});

describe('het pad in de opslag', () => {
  it('komt uit het inzendnummer en het type', () => {
    expect(fotoPad('HH-2026-0042', 'image/jpeg')).toBe('HH-2026-0042.jpg');
    expect(fotoPad('HH-2026-0042', 'image/png')).toBe('HH-2026-0042.png');
    expect(fotoPad('HH-2026-0042', 'image/webp')).toBe('HH-2026-0042.webp');
  });

  /**
   * Het pad mag nooit uit de bestandsnaam komen die de bezoeker meestuurt. Die
   * kan `../` bevatten, een dubbele extensie dragen, of het bestand van iemand
   * anders overschrijven. Deze test is er om die weg dicht te houden.
   */
  it('weigert een nummer dat niet van ons komt', () => {
    for (const rommel of ['../geheim', 'HH-2026-42', 'VH-2026-0042', '', 'HH-2026-0042/../x']) {
      expect(fotoPad(rommel, 'image/jpeg')).toBeNull();
    }
  });

  it('weigert een type dat niet in de lijst staat', () => {
    expect(fotoPad('HH-2026-0042', 'image/heic')).toBeNull();
  });
});

describe('leesbare grootte', () => {
  it('rekent om naar iets wat een mens leest', () => {
    expect(leesbareGrootte(800)).toBe('800 B');
    expect(leesbareGrootte(400_000)).toBe('391 kB');
    expect(leesbareGrootte(2_500_000)).toBe('2,4 MB');
  });

  it('geeft niets terug bij niets', () => {
    expect(leesbareGrootte(0)).toBe('');
    expect(leesbareGrootte(null)).toBe('');
    expect(leesbareGrootte(undefined)).toBe('');
  });
});

function rij(over: Partial<Inzending>): Inzending {
  return {
    id: 'x', nummer: 'HH-2026-0001', naam: 'A', email: 'a@b.nl', herinnering: 'tekst',
    mag_archief: false, mag_naam: false, nieuwsbrief: false, status: 'nieuw',
    created_at: '2026-09-01T10:00:00Z', foto_pad: null, foto_bytes: null, fotoUrl: null,
    ingetrokken_op: null,
    ...over,
  };
}

describe('de volgorde in het beheerscherm', () => {
  it('zet wat aandacht vraagt bovenaan', () => {
    const gesorteerd = sorteer([
      rij({ id: 'afgewezen', status: 'afgewezen' }),
      rij({ id: 'gelezen', status: 'gelezen' }),
      rij({ id: 'nieuw', status: 'nieuw' }),
      rij({ id: 'favoriet', status: 'favoriet' }),
    ]);
    expect(gesorteerd.map((r) => r.id)).toEqual(['nieuw', 'favoriet', 'gelezen', 'afgewezen']);
  });

  it('zet binnen dezelfde status die met foto vooraan', () => {
    const gesorteerd = sorteer([
      rij({ id: 'zonder', foto_pad: null }),
      rij({ id: 'met', foto_pad: 'HH-2026-0002.jpg' }),
    ]);
    expect(gesorteerd.map((r) => r.id)).toEqual(['met', 'zonder']);
  });

  it('zet daarbinnen het nieuwste bovenaan', () => {
    const gesorteerd = sorteer([
      rij({ id: 'oud', created_at: '2026-09-01T10:00:00Z' }),
      rij({ id: 'nieuw', created_at: '2026-09-05T10:00:00Z' }),
    ]);
    expect(gesorteerd.map((r) => r.id)).toEqual(['nieuw', 'oud']);
  });
});

describe('de kerncijfers', () => {
  it('tellen wat er op het scherm staat', () => {
    const c = kerncijfers([
      rij({ status: 'nieuw', foto_pad: 'a.jpg', mag_archief: true }),
      rij({ status: 'favoriet', foto_pad: 'b.jpg' }),
      rij({ status: 'winnaar' }),
      rij({ status: 'afgewezen' }),
    ]);
    expect(c.totaal).toBe(4);
    expect(c.nieuw).toBe(1);
    expect(c.metFoto).toBe(2);
    // Een winnaar telt mee op de shortlist: hij stond daar ook op.
    expect(c.favoriet).toBe(2);
    expect(c.magArchief).toBe(1);
  });
});

describe('de status', () => {
  it('herkent alleen de waarden die bestaan', () => {
    for (const s of STATUSSEN) expect(isStatus(s)).toBe(true);
    for (const rommel of ['verwijderd', '', null, 42, 'NIEUW']) expect(isStatus(rommel)).toBe(false);
  });
});

describe('de opslag blijft dicht', () => {
  /**
   * `mag_archief` staat standaard uit, dus hier liggen foto's van mensen die
   * uitdrukkelijk nee zeiden tegen publicatie. Een publieke bucket zou die op
   * een raadbare URL zetten. De migratie moet dat expliciet dichtzetten.
   */
  it('de migratie maakt een private bucket', () => {
    const migratie = lees('supabase/migrations/20260907_herinnering_fotos.sql');
    expect(migratie).toMatch(/public,\s*file_size_limit/);
    expect(migratie).toMatch(/'herinneringen',\s*\n?\s*FALSE/);
    expect(migratie).toContain('SET public = FALSE');
  });

  it('het beheerscherm haalt links op die verlopen', () => {
    const beheer = lees('src/lib/herinnering-beheer.ts');
    expect(beheer).toContain('createSignedUrls');
    expect(beheer).not.toContain('getPublicUrl');
  });

  /**
   * Een inzending is iemands toestemmingsverklaring, en dat is het bewijsstuk
   * waarmee je later kunt aantonen dat je de foto mocht gebruiken. De rij mag
   * er dus niet uit.
   */
  it('de beheerroute verwijdert nooit een inzending', () => {
    const route = lees('src/pages/api/beheer/herinnering.ts');
    expect(route).not.toContain('.delete(');
  });

  /**
   * Maar intrekken moet wél kunnen, en even makkelijk als geven (AVG art. 7
   * lid 3). Zonder deze handeling kun je een verzoek van een inzender niet
   * uitvoeren. De foto gaat uit de opslag, de twee gebruiksvinkjes op nee, en
   * er komt een datum bij zodat je kunt aantonen dát het gebeurd is.
   */
  it('kan een toestemming intrekken, met de foto erbij', () => {
    const route = lees('src/pages/api/beheer/herinnering.ts');
    expect(route).toContain("literal('intrekken')");
    expect(route).toContain('.remove([rij.foto_pad])');
    expect(route).toContain('mag_archief: false');
    expect(route).toContain('mag_naam: false');
    expect(route).toContain('ingetrokken_op');
  });

  /**
   * Het bestand eerst weg, dan pas de rij. Andersom zou de rij melden dat er is
   * ingetrokken terwijl de foto nog in de opslag ligt, en dan denkt iedereen
   * die het naleest dat het geregeld is.
   */
  it('werkt de rij niet bij als de foto blijft staan', () => {
    const route = lees('src/pages/api/beheer/herinnering.ts');
    const wisplek = route.indexOf('.remove([rij.foto_pad])');
    const bijwerkplek = route.indexOf('ingetrokken_op: new Date()');
    expect(wisplek).toBeGreaterThan(-1);
    expect(bijwerkplek).toBeGreaterThan(wisplek);
    expect(route).toContain('Niets gewijzigd.');
  });
});

describe('de volgorde van rij en bestand bij een inzending', () => {
  const route = lees('src/pages/api/herinnering.ts');

  /**
   * De rij eerst, dan het bestand. Andersom bleef er een weesbestand achter
   * zodra de rij afketste op de unieke index (iemand die al meedeed). Zo'n
   * bestand hoort bij niemand: geen rij, dus geen toestemmingsverklaring.
   */
  it('maakt de rij aan voordat de foto de opslag in gaat', () => {
    // Op posities zoeken en niet op exacte tekens: de opmaak van deze regels
    // mag wijzigen, de volgorde niet.
    const insert = route.search(/from\('herinneringen'\)[\s\n]*\.insert\(/);
    const upload = route.search(/storage[\s\S]{0,120}\.upload\(/);
    expect(insert).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(insert);
  });

  it('overschrijft nooit stil een bestaand bestand', () => {
    // Alleen de aanroep telt, niet het commentaar eromheen dat de keuze uitlegt.
    const aanroep = route.match(/\.upload\([\s\S]{0,200}?\)\;/)?.[0] ?? '';
    expect(aanroep).toContain('upsert: false');
    expect(aanroep).not.toContain('upsert: true');
  });
});
