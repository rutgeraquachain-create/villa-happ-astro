/**
 * Elke publieke POST-route accepteert alleen een formulier.
 *
 * WAAROM DEZE TOETS BESTAAT
 * -------------------------
 * Astro weigert formuliergecodeerde verzoeken van een andere site; op JSON
 * geldt die controle niet. Tussen 3 en 9 september 2026 kwam een bot daar drie
 * keer achter elkaar doorheen, en elke keer sloot ik één deur en verhuisde hij
 * naar de volgende:
 *
 *   3 t/m 7 sep   /api/newsletter     64 aanmeldingen, 60 mails, 1 spamklacht
 *   7 t/m 8 sep   /api/herinnering     8 inzendingen, 16 mails
 *   7 t/m 8 sep   /api/atelier/claim  51 nummers uit een oplage van 500
 *   8 op 9 sep    /api/newsletter      4 nieuwe rijen, want die had ik overgeslagen
 *
 * Deze toets telt de routes in plaats van ze op te sommen. Komt er een nieuwe
 * publieke POST-route bij zonder de controle, dan valt hij om. Dat is precies
 * wat er de vorige drie keer ontbrak: niets wees me op de deur die nog openstond.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const API = new URL('../src/pages/api/', import.meta.url);

/**
 * Routes die van buitenaf aangeroepen móéten worden en dus geen
 * herkomstcontrole kunnen hebben. Elke uitzondering staat hier met een reden;
 * een route zonder reden hoort er niet bij te staan.
 */
const BUITEN_BEELD: Record<string, string> = {
  'checkout/webhook.ts': 'Mollie roept dit aan, met een eigen vorm en zonder herkomst van ons.',
  'mail/webhook.ts': 'Resend roept dit aan om de aflevering van een mail terug te melden.',
  'newsletter/afmelden.ts': 'De uitschrijfknop in Gmail POST hierheen (RFC 8058), zonder herkomst.',
  'newsletter/bevestigen.ts': 'Draagt een ondertekend token; zonder dat token gebeurt er niets.',
  'beheer/login.ts': 'Beheerformulier. Wie hier langskomt heeft het wachtwoord nog nodig.',
  'beheer/logout.ts': 'Beheerformulier, achter de sessie. Uitloggen kost niemand iets.',
  'beheer/mailing.ts': 'Achter de beheersessie plus een CSRF-token in de body.',
  'beheer/herinnering.ts': 'Achter de beheersessie plus een CSRF-token in de body.',
  'beheer/actie.ts': 'Achter de beheersessie plus een CSRF-token in de body.',
  'beheer/outbox.ts': 'Achter de beheersessie plus een CSRF-token in de body.',
  'beheer/voorraad.ts': 'Achter de beheersessie plus een CSRF-token in de body.',
  /**
   * De kassa stuurt een winkelmandje als JSON. Die hoort hier op termijn ook
   * bij, maar de afweging is een andere: hier hangt geen mail aan een adres dat
   * de indiener zelf koos. Een bot die dit aanroept maakt een openstaande
   * betaling die niemand betaalt, en daar gaat niets de deur uit. De drie
   * routes waar de bot wél doorheen kwam, verstuurden alle drie mail.
   */
  'checkout/create.ts': 'Stuurt JSON met een winkelmandje; er gaat pas mail uit na betaling.',
};

/** Alle .ts-bestanden onder src/pages/api/, recursief. */
function routes(map = API, prefix = ''): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const pad = new URL(naam, map);
    if (statSync(pad).isDirectory()) {
      uit.push(...routes(new URL(naam + '/', map), prefix + naam + '/'));
    } else if (naam.endsWith('.ts')) {
      uit.push(prefix + naam);
    }
  }
  return uit;
}

const alle = routes();
const metPost = alle.filter((r) => readFileSync(new URL(r, API), 'utf-8').includes('export const POST'));
const teBewaken = metPost.filter((r) => !(r in BUITEN_BEELD));

describe('publieke POST-routes', () => {
  it('zijn er, anders bewijst deze suite niets', () => {
    // `it.each([])` draait nul keer en meldt groen. Zonder deze assertie zou
    // een verplaatste map de hele controle stilzwijgend uitzetten.
    expect(metPost.length).toBeGreaterThan(5);
    expect(teBewaken.length).toBeGreaterThan(0);
  });

  it.each(teBewaken)('%s weigert alles wat geen formulier is', (route) => {
    const bron = readFileSync(new URL(route, API), 'utf-8');
    // `isMultipartPost` telt mee: dat is dezelfde controle, strenger gezet voor
    // routes waar een bestand meekomt.
    const bewaakt = bron.includes('isFormulierPost') || bron.includes('isMultipartPost');
    expect(bewaakt, `${route} controleert het content-type niet`).toBe(true);
    // Een eigen kopie van de controle mag niet. Die loopt uit de pas met de
    // gedeelde versie zonder dat iemand het merkt; dat gebeurde al twee keer.
    expect(bron, `${route} leest JSON`).not.toContain('request.json()');
    expect(bron, `${route} heeft een eigen kopie van de controle`)
      .not.toMatch(/includes\(['"]multipart\/form-data['"]\)/);
  });

  /**
   * Een uitzondering mag, met een reden erbij. Wie een route toevoegt aan
   * BUITEN_BEELD zonder uitleg, zet de controle uit zonder dat iemand het ziet.
   */
  it('heeft bij elke uitzondering een reden staan', () => {
    for (const [route, reden] of Object.entries(BUITEN_BEELD)) {
      expect(reden.length, `${route} mist een reden`).toBeGreaterThan(20);
    }
  });

  it('noemt geen uitzonderingen die niet bestaan', () => {
    for (const route of Object.keys(BUITEN_BEELD)) {
      expect(alle, `${route} staat in BUITEN_BEELD maar bestaat niet`).toContain(route);
    }
  });
});

/**
 * Een honeypot die de route controleert maar geen pagina invult, vangt niets.
 *
 * Gemeten 9 september 2026: `notify.ts` en `reviews.ts` keken allebei naar een
 * veld `bedrijf`, en op de productpagina stond dat veld nergens. Een bot vult
 * de velden die hij in de HTML tegenkomt, dus die controle kon per definitie
 * niet aanslaan. Hij zag eruit als bescherming en was het niet.
 */
describe('elke honeypot bestaat aan beide kanten', () => {
  const BRON = new URL('../src/', import.meta.url);

  /** Alle .astro-bestanden onder src/, recursief. */
  function paginas(map = BRON, prefix = ''): string[] {
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

  const bestanden = paginas().map((p) => ({ pad: p, bron: readFileSync(new URL(p, BRON), 'utf-8') }));

  /**
   * Per route: op welk honeypotveld controleert hij, en welke pagina's roepen
   * hem aan. Het moet per aanroeper kloppen en niet ergens op de site: de fout
   * van 9 september was juist dat de voettekst het veld wél had en de
   * productpagina niet, terwijl de routes van die productpagina het
   * controleerden.
   */
  const koppels: { route: string; url: string; veld: string; aanroepers: string[] }[] = [];
  for (const route of metPost) {
    const bron = readFileSync(new URL(route, API), 'utf-8');
    const velden = new Set<string>();
    for (const m of bron.matchAll(/velden\.(\w+)|kies\(['"](\w+)['"]\)|body\.(\w+)/g)) {
      const veld = m[1] || m[2] || m[3];
      if (veld === 'bedrijf' || veld === 'company') velden.add(veld);
    }
    if (velden.size === 0) continue;

    const url = '/api/' + route.replace(/\.ts$/, '');
    const aanroepers = bestanden.filter((b) => b.bron.includes(`fetch('${url}'`)).map((b) => b.pad);
    for (const veld of velden) koppels.push({ route, url, veld, aanroepers });
  }

  it('vindt de aanroepers, anders bewijst dit niets', () => {
    expect(koppels.length).toBeGreaterThan(0);
    for (const k of koppels) {
      expect(k.aanroepers.length, `niemand roept ${k.url} aan`).toBeGreaterThan(0);
    }
  });

  it.each(koppels.map((k) => [k.route, k.url, k.veld, k.aanroepers] as const))(
    '%s controleert %s, en zijn aanroepers hebben dat veld',
    (_route, url, veld, aanroepers) => {
      for (const pad of aanroepers) {
        const bron = bestanden.find((b) => b.pad === pad)!.bron;

        // Er moet een verborgen veld staan. Zonder veld in de HTML vult geen
        // enkele bot het in, en controleert de route iets dat nooit voorkomt.
        expect(bron, `${pad} roept ${url} aan maar heeft geen verborgen veld`)
          .toContain('class="vh-hp"');

        // En het moet onder de naam meegaan waar de route op kijkt. De
        // leadpagina's noemen hun veld `hp` en sturen het als `company` door,
        // dus de naam in de HTML hoeft niet de naam in de verzending te zijn.
        const meegestuurd = bron.includes(`name="${veld}"`)
          || new RegExp(`set\\(['"]${veld}['"]`).test(bron);
        expect(meegestuurd, `${pad} stuurt niets mee onder de naam ${veld}`).toBe(true);
      }
    },
  );

  /**
   * Andersom net zo goed: een verborgen veld dat de route negeert, is een
   * vinkje zonder betekenis.
   */
  it('stuurt elk verborgen veld ook mee naar de route', () => {
    for (const pad of paginas()) {
      const bron = readFileSync(new URL(pad, BRON), 'utf-8');
      if (!bron.includes('class="vh-hp"')) continue;
      const naam = bron.match(/class="vh-hp"[\s\S]{0,400}?name="(\w+)"/)?.[1];
      expect(naam, `${pad} heeft een vh-hp-blok zonder naam`).toBeTruthy();
      // Twee manieren waarop het veld meegaat: expliciet gezet, of meegenomen
      // doordat het formulier zelf de FormData vult. Dat tweede werkt alleen
      // als het veld binnen het <form> staat, en dat is precies wat de
      // `name`-match hierboven aantoont.
      const meegestuurd = new RegExp(`set\\(['"]${naam}['"]|new FormData\\(\\s*\\w`).test(bron);
      expect(meegestuurd, `${pad} stuurt ${naam} niet mee`).toBe(true);
    }
  });
});

describe('de gedeelde controle', () => {
  it('herkent de twee vormen die een browserformulier stuurt', async () => {
    const { isFormulierPost } = await import('../src/lib/formulierpost');
    const maak = (type: string) =>
      new Request('https://villahapp.nl/x', { method: 'POST', headers: { 'content-type': type } });

    expect(isFormulierPost(maak('multipart/form-data; boundary=abc'))).toBe(true);
    expect(isFormulierPost(maak('application/x-www-form-urlencoded'))).toBe(true);
    expect(isFormulierPost(maak('application/json'))).toBe(false);
    expect(isFormulierPost(maak('text/plain'))).toBe(false);
    expect(isFormulierPost(new Request('https://villahapp.nl/x', { method: 'POST' }))).toBe(false);
  });

  it('laat de strenge variant alleen multipart door', async () => {
    const { isMultipartPost } = await import('../src/lib/formulierpost');
    const maak = (type: string) =>
      new Request('https://villahapp.nl/x', { method: 'POST', headers: { 'content-type': type } });

    expect(isMultipartPost(maak('multipart/form-data; boundary=abc'))).toBe(true);
    // Een formulier met een bestand kan niet urlencoded zijn, dus dit hoort
    // dicht te blijven op de route waar de foto meekomt.
    expect(isMultipartPost(maak('application/x-www-form-urlencoded'))).toBe(false);
    expect(isMultipartPost(maak('application/json'))).toBe(false);
  });

  it('leest een leeg veld als afwezig', async () => {
    const { formulierVelden } = await import('../src/lib/formulierpost');
    const fd = new FormData();
    fd.set('email', 'anouk@example.com');
    fd.set('source', '');
    const velden = await formulierVelden(
      new Request('https://villahapp.nl/x', { method: 'POST', body: fd }),
    );
    expect(velden.email).toBe('anouk@example.com');
    // Leeg moet undefined worden, anders overschrijft het de standaardwaarde
    // in het schema met een lege tekenreeks.
    expect(velden.source).toBeUndefined();
  });
});
