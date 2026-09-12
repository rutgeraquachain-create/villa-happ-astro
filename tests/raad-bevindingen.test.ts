/**
 * De bevindingen van de onafhankelijke ronde van 12 september 2026.
 *
 * Vijf lezers gingen los van elkaar door de code, vlak voordat de campagne
 * naar buiten zou gaan. Elke bevinding hieronder is daarna door mij tegen de
 * code geverifieerd; wat niet standhield staat niet in dit bestand. De
 * toelichting per blok zegt wat er stukging en waarom je het niet zag.
 *
 * Wat deze toetsen met elkaar gemeen hebben: geen van de fouten gaf een
 * foutmelding. Ze deden allemaal iets minder dan beloofd en meldden succes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapMollieStatus } from '../src/lib/checkout-logic';
import { classificeer, schoneHerkomst } from '../src/lib/herkomst';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

/**
 * Hetzelfde bestand, zonder commentaar.
 *
 * Nodig voor elke "dit patroon staat er NIET meer"-toets. De toelichtingen in
 * dit project citeren de oude code expres, zodat iemand over een jaar ziet wat
 * er misging. Zonder deze zeef keurt zo'n toets de uitleg af in plaats van de
 * code, en dan haal je de uitleg weg om de toets groen te krijgen. Dat is de
 * verkeerde kant op.
 */
function zonderCommentaar(pad: string): string {
  const bron = lees(pad);
  return pad.endsWith('.sql')
    ? bron.replace(/^\s*--.*$/gm, '')
    : bron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('een terugbetaalde bestelling springt niet terug naar betaald', () => {
  /**
   * Mollie roept deze webhook meer dan eens aan voor dezelfde betaling, ook ná
   * een terugbetaling: de terugbetaling is daar een eigen object met een eigen
   * statusverloop. De betaling zelf blijft dan gewoon op `paid` staan.
   *
   * De webhook vangt een terugbetaling af zolang het bedrag hoger is dan wat er
   * al geboekt stond. Bij de tweede aanroep is dat niet zo, en dan valt het
   * verzoek door naar deze functie. Die keek alleen of de order al op `paid`
   * stond — maar die stond op `refunded`, dus de rem sloeg niet aan.
   */
  it('een order op refunded blijft refunded bij een herhaalde paid-webhook', () => {
    const t = mapMollieStatus('paid', { payment_status: 'refunded', status: 'refunded' });
    expect(t.action).toBe('none');
    expect(t.payment_status).toBe('refunded');
    expect(t.status).toBe('refunded');
    expect(t.markPaidAt).toBe(false);
  });

  it('een betaalde order blijft met rust, zoals altijd al', () => {
    const t = mapMollieStatus('paid', { payment_status: 'paid', status: 'paid' });
    expect(t.action).toBe('none');
  });

  it('de gewone eerste betaling wordt nog steeds afgerond', () => {
    const t = mapMollieStatus('paid', { payment_status: 'open', status: 'pending' });
    expect(t.action).toBe('finalize');
    expect(t.markPaidAt).toBe(true);
  });

  /**
   * De tweede grendel, in de webhook zelf. `finalize_inventory` telt
   * onvoorwaardelijk af: `quantity - qty`, zonder enige voorwaarde op de order.
   * Eén verkeerde doorgang kost dus echte voorraad. Daarom slaat de webhook de
   * aftrek over als `paid_at` al gevuld is.
   */
  it('de webhook slaat de voorraadaftrek over als de order al afgerond was', () => {
    const bron = lees('src/pages/api/checkout/webhook.ts');
    const blok = bron.slice(bron.indexOf("transition.action === 'finalize'"));
    expect(blok).toMatch(/if \(order\.paid_at\)/);
    expect(blok.indexOf('if (order.paid_at)')).toBeLessThan(blok.indexOf('finalizeInventory'));
  });
});

describe('de mailing bereikt de hele lijst', () => {
  /**
   * `zetMailingKlaar` riep `verzendlijst(sb)` aan zonder tweede argument, en die
   * pakt standaard de eerste 200 op `created_at` oplopend. Adres 201 kreeg de
   * mailing nooit, en nog een keer op de knop drukken hielp niet: dezelfde query
   * gaf dezelfde 200 terug, die allemaal op hun dedupe-sleutel afketsten. Het
   * scherm meldde netjes "klaargezet voor 200 van 200 ontvangers".
   *
   * Dit is de fout die een campagne die de lijst laat groeien, het hardst raakt.
   */
  const bron = lees('src/lib/mailing.ts');

  it('de zending gebruikt de resterende lijst en niet de eerste pagina', () => {
    const fn = bron.slice(bron.indexOf('export async function zetMailingKlaar'));
    expect(fn).toMatch(/nogTeVerzenden\(sb, mailing\.slug\)/);
    // Precies het aanroeppatroon dat de fout was: de kale lijst zonder filter.
    expect(fn).not.toMatch(/await verzendlijst\(sb\)/);
  });

  it('wie de mailing al heeft, wordt overgeslagen', () => {
    const fn = bron.slice(bron.indexOf('export async function nogTeVerzenden'));
    expect(fn).toMatch(/uitgaande_mail/);
    expect(fn).toMatch(/gehad\.has\(email\)/);
  });

  it('de uitslag zegt hoeveel er nog wachten', () => {
    expect(bron).toMatch(/resterend: number/);
    expect(lees('src/pages/beheer/mailing.astro')).toMatch(/data\.resterend/);
  });

  it('de lijstgrootte wordt geteld en niet afgeleid uit een opgehaalde pagina', () => {
    const kaal = zonderCommentaar('src/lib/mailing.ts');
    const fn = kaal.slice(kaal.indexOf('export async function mailingStand'));
    expect(fn).toMatch(/count: 'exact', head: true/);
    expect(fn).not.toMatch(/verzendlijst\(sb, 10_000\)/);
  });
});

describe('de mailwachtrij meldt geen rust als hij niet kon kijken', () => {
  /**
   * `leesAchterstand` gooide de fout van de RPC weg en gaf dan vier keer nul
   * terug. Vier keer nul leest als "alles in orde", en het beheerscherm toonde
   * dan helemaal geen melding. Dat is dezelfde fout als de cron die een week
   * lang 503 gaf terwijl de planning goed stond (les 0158): het bewakingsscherm
   * dat niet kán meten, hoort dat te zeggen en geen rust te melden.
   */
  const bron = lees('src/lib/outbox.ts');

  it('een mislukte telling geeft gemeten: false', () => {
    const fn = bron.slice(bron.indexOf('async function leesAchterstand'));
    expect(fn).toMatch(/if \(error\)/);
    expect(fn).toMatch(/return NIET_GEMETEN/);
  });

  it('de fout van de RPC wordt gelezen en niet weggegooid', () => {
    const fn = bron.slice(bron.indexOf('async function leesAchterstand'));
    expect(fn).toMatch(/const \{ data, error \} = await sb\.rpc\('outbox_achterstand'\)/);
  });

  it('het beheerscherm toont dat er niets gemeten is', () => {
    const paneel = lees('src/pages/beheer/index.astro');
    expect(paneel).toMatch(/!outbox\.gemeten/);
    expect(paneel).toMatch(/outbox\.gemeten && \(outbox\.wachtendVooraf > 0/);
  });
});

describe('de tegoedbon kan niet twee keer gebruikt worden', () => {
  /**
   * De oude claim gaf de bon opnieuw weg zodra de vorige claim dertig minuten
   * oud was. Dat kijkt naar de klok en niet naar de bestelling, en een
   * bestelling van dertig minuten oud is niet dood: de betaallink van Mollie
   * werkt nog. Wie twee keer begon en daarna beide links betaalde, kreeg twee
   * keer 75 euro korting van één bon. Het inwisselen van de eerste bestelling
   * matchte op niets, gaf geen fout, en niemand keek naar het aantal rijen.
   */
  const sql = lees('supabase/migrations/20260912_tegoedbon_dubbelgebruik.sql');

  it('een claim gaat pas over als de vorige bestelling geannuleerd is', () => {
    expect(sql).toMatch(/o\.status = 'cancelled'/);
  });

  it('de vervaltijd op de klok is weg', () => {
    expect(zonderCommentaar('supabase/migrations/20260912_tegoedbon_dubbelgebruik.sql'))
      .not.toMatch(/INTERVAL '30 minutes'/);
  });

  it('de bon blijft onaanraakbaar zodra hij is ingewisseld', () => {
    expect(sql).toMatch(/t\.ingewisseld_op IS NULL/);
    expect(sql).toMatch(/t\.verloopt_op > NOW\(\)/);
  });

  it('inwisselen meldt of er werkelijk een bon is ingewisseld', () => {
    const bron = lees('src/lib/tegoedbon.ts');
    const fn = bron.slice(bron.indexOf('export async function wisselBonIn'));
    expect(fn).toMatch(/Promise<boolean>/);
    expect(fn).toMatch(/rijen > 0/);
  });

  it('de webhook legt vast als een bon niet ingewisseld kon worden', () => {
    const bron = lees('src/pages/api/checkout/webhook.ts');
    expect(bron).toMatch(/order\.tegoedbon_code && !bonIngewisseld/);
    expect(bron).toMatch(/logGebeurtenis\(sb, order\.id, 'opmerking'/);
  });

  it('een gestrand afrekenen geeft de bon terug', () => {
    const bron = lees('src/pages/api/checkout/create.ts');
    // Eén uitgang voor alles ná de claim, zodat er geen pad bijkomt dat hem
    // vergeet. Dat was precies wat er misging: de voorraad ging terug, de bon
    // niet, en de winnaar kreeg bij zijn tweede poging te horen dat zijn code
    // niet werkte.
    expect(bron).toMatch(/const stop = async \(/);
    expect(bron).toMatch(/if \(bonCode\) await geefBonVrij\(sb, order\.id\)/);
    const naClaim = bron.slice(bron.indexOf('const stop = async ('));
    // Geen enkele uitgang ná de claim mag nog los annuleren zonder stop().
    const losseAnnuleringen = naClaim.match(/status: 'cancelled', payment_status: 'failed'/g) || [];
    expect(losseAnnuleringen.length).toBe(1);
  });

  it('de korting wordt niet stil weggeschreven', () => {
    const bron = lees('src/pages/api/checkout/create.ts');
    expect(bron).toMatch(/const \{ error: kortingErr \}/);
    expect(bron).toMatch(/if \(kortingErr\)/);
  });
});

describe('de remmelding komt aan bij de bezoeker', () => {
  /**
   * `tooManyRequests()` gaf alleen `{ error }`, en de formulierpagina's lezen
   * `data.message`. De bezoeker kreeg dus de terugval "Er ging iets mis. Probeer
   * opnieuw." — een tekst die uitnodigt tot precies de herhaling die wordt
   * geweigerd.
   */
  it('het antwoord draagt zowel error als message', async () => {
    const { tooManyRequests } = await import('../src/lib/rate-limit');
    const body = await tooManyRequests().json();
    expect(body.message).toMatch(/opnieuw/);
    expect(body.error).toBe(body.message);
    expect(body.success).toBe(false);
  });

  it('de herinneringspagina leest een veld dat er ook echt in zit', () => {
    const pagina = lees('src/pages/herinnering.astro');
    expect(pagina).toMatch(/data\.message \|\|/);
  });
});

describe('de herkomst van een bezoeker wordt niet aan Google toegeschreven', () => {
  /**
   * `host.startsWith('google.') || host.includes('.google.')` matcht ook
   * `google.evil.com` en `nep.google.phishing.com`. Die kwamen dan als
   * ORGANISCH in de rapportage. Geen fout, alleen een getal dat niet klopt, en
   * dat getal is waarop deze campagne gestuurd wordt.
   */
  const kanaalVan = (verwijzer: string) =>
    classificeer(schoneHerkomst(JSON.stringify({ meting: 'ingang', verwijzer })));

  it.each([
    'google.com',
    'www.google.nl',
    'google.co.uk',
    'google.com.au',
    'images.google.de',
  ])('%s telt als zoekmachine', (host) => {
    expect(kanaalVan(host)).toBe('ORGANISCH');
  });

  it.each([
    'google.evil.com',
    'nep.google.phishing.com',
    'googlement.nl',
    'mijngoogle.nl',
  ])('%s telt niet als zoekmachine', (host) => {
    expect(kanaalVan(host)).toBe('VERWIJZING');
  });
});

describe('de ingang wordt niet uit de opslag gehaald zonder toestemming', () => {
  /**
   * Schrijven stond al achter de toestemmingscontrole, lezen niet. En de
   * sleutel werd alleen gewist als de bezoeker zijn keuze wijzigde terwijl de
   * pagina openstond. Wie zijn toestemming op een ander moment introk, werd
   * daarna nog steeds gemeten uit wat er op zijn apparaat stond.
   */
  const bron = lees('src/lib/herkomst-client.ts');

  it('zonder toestemming wordt de opslag gewist en niet gelezen', () => {
    const fn = bron.slice(bron.indexOf('export function legIngangVast'));
    expect(fn).toMatch(/if \(!magBewaren\(\)\) \{\s*\n\s*wisOpslag\(\);/);
    // leesOpslag() staat uitsluitend in de tak waar toestemming er wél is.
    const zonder = fn.slice(fn.indexOf('if (!magBewaren())'), fn.indexOf('} else {'));
    expect(zonder).not.toMatch(/leesOpslag\(\)/);
  });
});
