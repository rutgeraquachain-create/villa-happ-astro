/**
 * De remmen op de aanmeldstroom.
 *
 * Aanleiding, gemeten 7 september 2026: tussen 3 en 7 september kwamen er 64
 * aanmeldingen binnen en gingen er 60 bevestigingsmails uit naar mensen die er
 * niet om vroegen. Twee bounces en één spamklacht, op een domein dat in oktober
 * een echte mailing moet kunnen versturen.
 *
 * Deze tests bewaken de drie dingen die dat toen niet tegenhielden.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  domeinGeweigerd, schoneBron, magBevestigingVersturen, MAX_BEVESTIGINGEN_PER_UUR,
} from '../src/lib/aanmeldrem';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

/** Test-dubbel dat teruggeeft wat de teller zou vinden, plus wat er gevraagd is. */
function nepDb(count: number | null, error: { message: string } | null = null) {
  const gevraagd: Record<string, unknown> = {};
  const sb = {
    from(tabel: string) {
      gevraagd.tabel = tabel;
      const ketting: Record<string, unknown> = {
        select: () => ketting,
        eq: (kolom: string, waarde: unknown) => { gevraagd.eq = [kolom, waarde]; return ketting; },
        gte: (kolom: string, waarde: unknown) => {
          gevraagd.gte = [kolom, waarde];
          return Promise.resolve({ count, error });
        },
      };
      return ketting;
    },
  } as any;
  return { sb, gevraagd };
}

describe('sms-gateways en verwanten', () => {
  it('weigert het adrestype dat bij dit misbruik het doelwit is', () => {
    // Mail naar vtext.com wordt een tekstbericht op iemands telefoon. Zo'n adres
    // komt bij een Nederlandse kledingwinkel nooit legitiem binnen.
    expect(domeinGeweigerd('5551234567@vtext.com')).toBe(true);
    expect(domeinGeweigerd('5551234567@tmomail.net')).toBe(true);
  });

  it('laat gewone adressen met rust, ook zakelijke', () => {
    for (const adres of ['anouk@gmail.com', 'r@villahapp.nl', 'iemand@nbbj.com']) {
      expect(domeinGeweigerd(adres)).toBe(false);
    }
  });

  it('valt niet om op een adres zonder domein', () => {
    expect(domeinGeweigerd('kapot')).toBe(false);
  });
});

describe('de herkomst van een aanmelding', () => {
  /**
   * Dit veld werd letterlijk uit de request overgenomen, dus de bot bepaalde
   * zelf wat er in de kolom kwam. Veertig rijen kregen `atelier` mee terwijl
   * geen enkele pagina die waarde verstuurt, en daardoor wees de eerste analyse
   * naar het verkeerde kanaal.
   */
  it('laat alleen de bronnen door die de site zelf stuurt', () => {
    expect(schoneBron('footer')).toBe('footer');
    expect(schoneBron('herinnering')).toBe('herinnering');
  });

  it('vervangt een verzonnen herkomst door onbekend', () => {
    expect(schoneBron('<script>')).toBe('onbekend');
    expect(schoneBron('gratis-iphone')).toBe('onbekend');
    expect(schoneBron(undefined)).toBe('onbekend');
    expect(schoneBron('')).toBe('onbekend');
  });
});

describe('de bovengrens per uur', () => {
  it('laat door zolang er ruimte is', async () => {
    const { sb } = nepDb(MAX_BEVESTIGINGEN_PER_UUR - 1);
    expect(await magBevestigingVersturen(sb)).toBe(true);
  });

  it('sluit zodra de grens geraakt is', async () => {
    const { sb } = nepDb(MAX_BEVESTIGINGEN_PER_UUR);
    expect(await magBevestigingVersturen(sb)).toBe(false);
  });

  it('telt alleen bevestigingsmails van het laatste uur', async () => {
    const { sb, gevraagd } = nepDb(0);
    await magBevestigingVersturen(sb);
    expect(gevraagd.tabel).toBe('uitgaande_mail');
    expect(gevraagd.eq).toEqual(['soort', 'nieuwsbrief-bevestiging']);
    const [kolom, sinds] = gevraagd.gte as [string, string];
    expect(kolom).toBe('created_at');
    const verschilMin = (Date.now() - Date.parse(sinds)) / 60_000;
    expect(verschilMin).toBeGreaterThan(59);
    expect(verschilMin).toBeLessThan(61);
  });

  /**
   * Een kapotte rem mag geen echte aanmelding blokkeren. Andersom geredeneerd:
   * bij twijfel gaat de mail eruit, want de bezoeker die hier legitiem staat
   * wacht anders op iets dat nooit komt.
   */
  it('laat door als de telling zelf faalt', async () => {
    const stil = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sb } = nepDb(null, { message: 'kapot' });
    expect(await magBevestigingVersturen(sb)).toBe(true);
    stil.mockRestore();
  });
});

describe('de inzendroute accepteert alleen een formulier', () => {
  const route = lees('src/pages/api/herinnering.ts');

  /**
   * Astro weigert formuliergecodeerde en multipart-verzoeken van een andere
   * site. Op JSON geldt die controle niet, en dat was het gat waar de acht
   * botinzendingen van 8 september 2026 doorheen kwamen. De pagina stuurt al
   * multipart, dus dit pad sluiten kost de bezoeker niets.
   */
  it('weigert alles wat geen multipart is', () => {
    // De controle zelf staat sinds 9 september in src/lib/formulierpost.ts, met
    // een eigen toets die alle publieke POST-routes langsloopt. Hier blijft
    // alleen staan dát deze route hem gebruikt, en in de strenge vorm: er komt
    // een foto mee, dus urlencoded hoort er ook niet in.
    expect(route).toContain('isMultipartPost');
    expect(route).toContain('Stuur je inzending via het formulier op de site.');
  });

  it('leest de body niet meer als JSON', () => {
    expect(route).not.toContain('await request.json()');
  });

  it('remt ook de inzendbevestiging', () => {
    expect(route).toContain('magInzendbevestigingVersturen');
  });
});

describe('de atelierclaim is even dicht als de rest', () => {
  const route = lees('src/pages/api/atelier/claim.ts');
  const pagina = lees('src/pages/het-atelier.astro');

  /**
   * Dit was de laatste open deur, en de duurste. Van de vierenvijftig claims op
   * de genummerde oplage waren er eenenvijftig van een bot, en elf daarvan
   * kwamen binnen nadat de andere twee formulieren al dicht waren. Een nummer
   * uit een oplage van 500 met certificaat komt niet terug.
   */
  it('weigert alles wat geen formulier is', () => {
    expect(route).toContain('Claim je nummer via het formulier op de site.');
    expect(route).not.toContain('await request.json()');
  });

  it('heeft een honeypot, aan beide kanten', () => {
    expect(pagina).toContain('name="bedrijf"');
    expect(pagina).toContain('vh-hp');
    expect(route).toContain("kies('bedrijf')");
  });

  /**
   * Bij een gevulde honeypot mag er geen echt nummer uit. Dat zou een plek uit
   * de oplage kosten, en dat is precies de schade die we willen stoppen.
   */
  it('geeft bij een honeypot geen nummer uit de oplage weg', () => {
    // Het blok zelf pakken en niet op een woord snijden dat ook in de imports
    // staat: die eerste versie sneed op `domeinGeweigerd` en leverde een leeg
    // stuk op, waarmee de toets iets anders keurde dan hij beweerde.
    const blok = route.match(/if \(honeypot\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(blok).toContain('number: 0');
    expect(blok).not.toContain('next_atelier_number');
    expect(blok).not.toContain('.insert(');
  });

  it('stuurt de pagina een formulier en geen JSON', () => {
    expect(pagina).toContain('new FormData()');
    const aanroep = pagina.slice(pagina.indexOf("fetch('/api/atelier/claim'"), pagina.indexOf("fetch('/api/atelier/claim'") + 200);
    expect(aanroep).not.toContain('application/json');
  });
});

describe('de honeypots staan er echt in', () => {
  it('op het aanmeldveld van de homepage', () => {
    const finale = lees('src/components/home/Finale.astro');
    expect(finale).toContain('name="bedrijf"');
    expect(finale).toContain('vh-hp');
  });

  it('en de routes negeren een gevuld veld', () => {
    for (const pad of ['src/pages/api/newsletter.ts', 'src/pages/api/herinnering.ts']) {
      expect(lees(pad)).toContain('body.bedrijf');
    }
  });
});

describe('bevestigen gebeurt niet meer bij het openen van de link', () => {
  const pagina = lees('src/pages/nieuwsbrief/bevestigen.astro');

  /**
   * De kern van de fout van 4 september: negen zakelijke mailscanners klikten
   * de bevestigingslink, zes ervan binnen een minuut. Die adressen stonden
   * daarna als toestemming op de lijst. Zet dit dus niet terug naar een GET die
   * meteen wegschrijft.
   */
  it('schrijft niets weg tijdens het renderen', () => {
    expect(pagina).not.toMatch(/\.update\(/);
    expect(pagina).not.toMatch(/confirmed:\s*true/);
  });

  it('toont een knop die POST doet', () => {
    expect(pagina).toContain('method="POST"');
    expect(pagina).toContain('/api/newsletter/bevestigen');
  });

  it('en die route bestaat en accepteert alleen POST', () => {
    const route = lees('src/pages/api/newsletter/bevestigen.ts');
    expect(route).toContain('export const POST');
    expect(route).not.toContain('export const GET');
  });
});
