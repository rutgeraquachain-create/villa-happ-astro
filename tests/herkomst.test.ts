/**
 * Herkomst: waar een bestelling, aanmelding of herinnering vandaan kwam.
 *
 * Drie soorten toetsen, en ze doen elk iets anders:
 *  - een tabel die per tak zegt WAAROM een invoer een kanaal krijgt;
 *  - een vingerafdruk over de hele invoerruimte, die DAT er iets veranderde
 *    vangt, ook als geen enkel voorbeeld in de tabel het raakt;
 *  - toetsen op de bedrading, want een classificatie die klopt maar door geen
 *    route wordt aangeroepen, meet niets.
 *
 * De vingerafdruk komt uit een ander project, waar een lijst voorbeelden in
 * vier reviewrondes vier keer een gat bleek te hebben: een toevoeging aan een
 * hostlijst, een omgewisselde tak, en twee keer een geval dat net buiten de
 * voorbeelden viel. Een opsomming van gevallen is nooit compleet.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  classificeer, schoneHerkomst, herkomstKolommen, herkomstVoorNieuwsbrief,
  HERKOMST_VERSIE, type Herkomst, type Kanaal,
} from '../src/lib/herkomst';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

describe('het kanaal, tak voor tak', () => {
  const gevallen: [string, Herkomst, Kanaal][] = [
    ['een Google-klik-id is Ads', { klik_id: 'Cj0KCQjw1234567890' }, 'ADS'],
    ['cpc zonder klik-id is Ads', { utm_source: 'bing', utm_medium: 'cpc' }, 'ADS'],
    // `\b` telt `_` als woordteken. Zonder de omzetting naar spaties viel
    // betaald sociaal verkeer in de campagne-emmer.
    ['paid_social is Ads', { utm_source: 'linkedin', utm_medium: 'paid_social' }, 'ADS'],
    // De volgorde: Ads gaat vóór AI. Een klik-id met een AI-bron is een advertentie.
    ['klik-id wint van een AI-bron', { klik_id: 'Cj0KCQjw1234567890', utm_source: 'claude' }, 'ADS'],
    ['offline_qr is offline', { utm_source: 'flyer', utm_medium: 'offline_qr' }, 'OFFLINE'],
    // AI vóór de utm-bron: anders valt de helft van dit kanaal als campagne weg.
    ['een kale AI-naam als bron is AI', { utm_source: 'chatgpt' }, 'AI_ASSISTENT'],
    ['een AI-host als verwijzer is AI', { verwijzer: 'chatgpt.com' }, 'AI_ASSISTENT'],
    ['een subdomein van een AI-host is AI', { verwijzer: 'chat.openai.com' }, 'AI_ASSISTENT'],
    // Alleen een EXACTE naam telt; een campagne die zo heet is een campagne.
    ['een campagne met een AI-woord erin is een campagne', { utm_source: 'claude-actie' }, 'CAMPAGNE'],
    ['de LinkedIn-post met utm is een campagne', { utm_source: 'linkedin', utm_medium: 'social' }, 'CAMPAGNE'],
    ['geen enkel signaal is direct', {}, 'DIRECT'],
    // De eigen site als verwijzer meet niets: de echte bron is overschreven.
    ['de eigen site als verwijzer is onbekend', { verwijzer: 'villahapp.nl' }, 'ONBEKEND'],
    ['het oude domein ook', { verwijzer: 'villa-happ.nl' }, 'ONBEKEND'],
    ['google op een landdomein is organisch', { verwijzer: 'google.de' }, 'ORGANISCH'],
    ['ecosia is organisch', { verwijzer: 'ecosia.org' }, 'ORGANISCH'],
    ['linkedin zonder utm is een verwijzing', { verwijzer: 'linkedin.com' }, 'VERWIJZING'],
    ['de linkverkorter van LinkedIn is een verwijzing', { verwijzer: 'lnkd.in' }, 'VERWIJZING'],
  ];

  it.each(gevallen)('%s', (_naam, invoer, verwacht) => {
    expect(classificeer(invoer)).toBe(verwacht);
  });
});

describe('de hele invoerruimte, als vingerafdruk', () => {
  /**
   * Vier signalen, gevarieerd over waarden die elk een andere tak raken. Wat de
   * uitkomst binnen deze ruimte ook verandert (een omgewisselde tak, een host
   * erbij of eraf, een woord uit een reguliere expressie), deze toets valt om.
   *
   * VALT HIJ OM, DAN IS DAT GEEN TOETS OM BIJ TE WERKEN MAAR EEN BESLISSING.
   * Dezelfde invoer levert dan een ander kanaal op dan de rijen die al in de
   * database staan. Verhoog `HERKOMST_VERSIE` in src/lib/herkomst.ts, zet de
   * nieuwe vingerafdruk hieronder, en bedenk of oude rijen opnieuw ingedeeld
   * moeten worden. Zonder het versienummer is een tabel met rijen van twee
   * regels niet te onderscheiden van een tabel die helemaal om is.
   */
  const KLIK = ['', 'Cj0KCQjw1234567890'];
  const BRON = ['', 'linkedin', 'chatgpt', 'google', 'claude-actie'];
  const MEDIUM = ['', 'cpc', 'paid_social', 'offline_qr', 'social'];
  const VERWIJZER = ['', 'villahapp.nl', 'google.de', 'chatgpt.com', 'linkedin.com', 'lnkd.in'];

  function ruimte(): string {
    const regels: string[] = [];
    for (const k of KLIK) for (const b of BRON) for (const m of MEDIUM) for (const v of VERWIJZER) {
      const h: Herkomst = {};
      if (k) h.klik_id = k;
      if (b) h.utm_source = b;
      if (m) h.utm_medium = m;
      if (v) h.verwijzer = v;
      regels.push(`${k}|${b}|${m}|${v}=${classificeer(h)}`);
    }
    return regels.join('\n');
  }

  it('omvat de ruimte die hij belooft', () => {
    // Zonder deze telling kan een lege lus een vaste vingerafdruk opleveren.
    expect(ruimte().split('\n')).toHaveLength(2 * 5 * 5 * 6);
  });

  it('geeft bij versie 1 exact dezelfde uitkomsten', () => {
    const vingerafdruk = createHash('sha256').update(ruimte()).digest('hex').slice(0, 16);
    expect(HERKOMST_VERSIE, 'versie gewijzigd: zet de nieuwe vingerafdruk hieronder').toBe(1);
    // Vastgezet op 11 september 2026, nadat de tabel hierboven alle takken
    // groen had. Een vingerafdruk bewijst niet dat het gedrag goed is, alleen
    // dat het niet veranderde; de tabel is wat zegt dat het goed is.
    expect(vingerafdruk).toBe('49ba90ded969c595');
  });
});

describe('opschonen op de server', () => {
  it('neemt alleen bekende sleutels over', () => {
    const h = schoneHerkomst(JSON.stringify({ utm_source: 'linkedin', rol: 'admin', __proto__: { x: 1 } }));
    expect(h).toEqual({ utm_source: 'linkedin' });
  });

  it('brengt een volledige verwijzer terug tot zijn host', () => {
    // De volledige url kan een zoekopdracht of een persoonlijke link dragen.
    const h = schoneHerkomst({ verwijzer: 'https://www.google.com/search?q=jan+jansen+adres' });
    expect(h.verwijzer).toBe('google.com');
  });

  it('haalt de querystring van het ingangspad af', () => {
    expect(schoneHerkomst({ ingang: '/herinnering?utm_source=x&email=a@b.nl' }).ingang).toBe('/herinnering');
  });

  it('weigert een pad dat niet op de eigen site ligt', () => {
    expect(schoneHerkomst({ ingang: 'https://elders.nl/pagina' }).ingang).toBeUndefined();
  });

  it('laat een utm-waarde vallen die op een e-mailadres lijkt', () => {
    expect(schoneHerkomst({ utm_content: 'jan@example.com' }).utm_content).toBeUndefined();
  });

  it('knipt te lange waarden af', () => {
    expect(schoneHerkomst({ utm_campaign: 'x'.repeat(500) }).utm_campaign).toHaveLength(100);
  });

  it('haalt stuurtekens eruit en laat koppeltekens staan', () => {
    // De tegenproef op de tekenklasse: stond daar per ongeluk een spatie en een
    // koppelteken, dan werd `herinnering-2026` hier `herinnering2026`.
    expect(schoneHerkomst({ utm_campaign: 'herinnering-2026' }).utm_campaign).toBe('herinnering-2026');
  });

  it('weigert een klik-id met vreemde tekens', () => {
    expect(schoneHerkomst({ klik_id: '<script>alert(1)</script>' }).klik_id).toBeUndefined();
  });

  it.each(['', 'geen json', '[1,2]', 'null', '"tekst"', 'x'.repeat(2001)])(
    'geeft een leeg object bij %s in plaats van te falen',
    (ruw) => { expect(schoneHerkomst(ruw)).toEqual({}); },
  );

  it('zet de versie van de regels op de rij', () => {
    const k = herkomstKolommen('{"utm_source":"linkedin"}');
    expect(k.herkomst.versie).toBe(HERKOMST_VERSIE);
    expect(k.herkomst_kanaal).toBe('CAMPAGNE');
  });
});

describe('de eerste aanraking wint', () => {
  it('laat een bestaande herkomst staan', () => {
    // Een upsert laat kolommen ongemoeid die hij niet noemt, dus leeg is genoeg.
    expect(herkomstVoorNieuwsbrief({ herkomst_kanaal: 'CAMPAGNE' }, '{"verwijzer":"google.de"}')).toEqual({});
  });

  it('vult hem in bij een nieuwe rij', () => {
    expect(herkomstVoorNieuwsbrief(null, '{"verwijzer":"google.de"}').herkomst_kanaal).toBe('ORGANISCH');
  });

  it('vult hem in bij een rij van vóór de meting', () => {
    expect(herkomstVoorNieuwsbrief({ herkomst_kanaal: null }, '{}').herkomst_kanaal).toBe('DIRECT');
  });
});

describe('de bedrading', () => {
  /**
   * Een classificatie die klopt maar door geen route wordt aangeroepen, meet
   * niets. En een upsert zonder de check op een bestaande rij overschrijft de
   * herkomst van de eerste aanmelding bij elke volgende.
   */
  it.each([
    ['src/pages/api/herinnering.ts', 'herkomstKolommen(body.herkomst)'],
    ['src/pages/api/checkout/create.ts', 'herkomstKolommen(body.herkomst)'],
    ['src/pages/api/newsletter.ts', 'herkomstVoorNieuwsbrief(bestaand, body.herkomst)'],
    ['src/pages/api/herinnering.ts', 'herkomstVoorNieuwsbrief(bestaand, herkomst)'],
    ['src/lib/nieuwsbrief-checkout.ts', 'herkomstVoorNieuwsbrief(bestaand, herkomst)'],
    ['src/pages/api/checkout/webhook.ts', 'order.herkomst'],
  ])('%s schrijft de herkomst mee', (pad, aanroep) => {
    expect(lees(pad)).toContain(aanroep);
  });

  it.each([
    'src/pages/api/newsletter.ts',
    'src/pages/api/herinnering.ts',
    'src/lib/nieuwsbrief-checkout.ts',
  ])('%s leest de bestaande herkomst voordat hij upsert', (pad) => {
    expect(lees(pad)).toContain("select('confirmed, unsubscribed_at, herkomst_kanaal')");
  });

  it.each([
    'src/components/layout/Footer.astro',
    'src/components/home/Finale.astro',
    'src/pages/herinnering.astro',
    'src/pages/checkout/index.astro',
  ])('%s stuurt de herkomst mee', (pad) => {
    expect(lees(pad)).toContain('herkomstVoorVerzending()');
  });

  it('legt de ingang vast bij elke pageload', () => {
    expect(lees('src/layouts/Base.astro')).toContain('legIngangVast()');
  });

  /**
   * Gevangen tijdens het bouwen: de eerste versie gaf het veld `.max(2000)` in
   * het schema. Is het te lang, dan wijst zod het HELE verzoek af en verlies je
   * een aanmelding of een bestelling om een meetveld.
   */
  it.each([
    'src/pages/api/newsletter.ts',
    'src/pages/api/herinnering.ts',
    'src/lib/checkout-logic.ts',
  ])('%s laat een te lang herkomstveld de aanvraag niet breken', (pad) => {
    const bron = lees(pad);
    expect(bron).toContain('herkomst: z.string().optional()');
    expect(bron).not.toMatch(/herkomst:\s*z\.string\(\)\.max/);
  });

  it('heeft de kolommen op alle drie de tabellen', () => {
    const sql = lees('supabase/migrations/20260911_herkomst.sql');
    for (const tabel of ['orders', 'newsletter_subscribers', 'herinneringen']) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${tabel}[\\s\\S]*?herkomst_kanaal TEXT`));
    }
  });
});

describe('de meting in GA4', () => {
  it.each([
    ['src/pages/herinnering.astro', "trackGenerateLead('herinnering')"],
    ['src/components/layout/Footer.astro', "trackGenerateLead('nieuwsbrief')"],
    ['src/components/home/Finale.astro', "trackGenerateLead('nieuwsbrief')"],
  ])('%s meet een geslaagde inzending', (pad, aanroep) => {
    expect(lees(pad)).toContain(aanroep);
  });

  it('telt een adres dat er al op stond niet als nieuwe lead', () => {
    expect(lees('src/components/layout/Footer.astro')).toContain('if (!data.alOpLijst)');
    expect(lees('src/components/home/Finale.astro')).toContain('!data.alOpLijst');
  });

  /**
   * De honeypot en het geweigerde domein antwoorden exact als een geslaagde
   * aanmelding, zodat een bot niet merkt dat hij gevangen is. Een vlag die
   * alleen op de échte antwoorden staat, zou dat verschil verraden.
   */
  it('verraadt de honeypot niet met een vlag op de echte antwoorden', () => {
    const route = lees('src/pages/api/newsletter.ts');
    expect(route).not.toMatch(/nieuweAanmelding|\bnieuw:\s*true/);
    const kijk = /const KIJK_IN_JE_MAIL = \{[\s\S]*?\};/.exec(route)?.[0] ?? '';
    expect(kijk, 'KIJK_IN_JE_MAIL niet gevonden').not.toBe('');
    expect(kijk).not.toContain('alOpLijst');
  });
});
