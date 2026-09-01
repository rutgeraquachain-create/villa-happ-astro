import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  verifieerHandtekening, duidGebeurtenis, magBijwerken,
  leesDetail, leesOntvanger, AFLEVERING_RANG, TIJDSPELING_SECONDEN,
  type Aflevering,
} from '../src/lib/mail-webhook';

/**
 * De sleutel zoals Resend hem levert: `whsec_` plus base64. Dat voorvoegsel
 * hoort er niet in de HMAC-sleutel te zitten en het base64-deel moet naar bytes
 * gedecodeerd worden. Wie dat overslaat krijgt een handtekening die nooit
 * klopt, en dat is de makkelijkste manier om deze route stil kapot te maken.
 */
const GEHEIM = 'whsec_' + Buffer.from('villa-happ-test-sleutel-0123456789').toString('base64');
const NU = 1_756_600_000;

/**
 * Tekent zoals Svix dat doet. Bewust hier uitgeschreven in plaats van een
 * hulpfunctie uit de bron te lenen: zo toetst de test het schema en niet zijn
 * eigen weerspiegeling.
 */
function teken(id: string, ts: number, body: string, geheim = GEHEIM): string {
  const sleutel = Buffer.from(geheim.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', sleutel).update(`${id}.${ts}.${body}`).digest('base64');
  return `v1,${sig}`;
}

const BODY = JSON.stringify({
  type: 'email.delivered',
  data: { email_id: 'abc-123', to: ['contact@villahapp.nl'] },
});

function invoer(over: Partial<Parameters<typeof verifieerHandtekening>[0]> = {}) {
  return {
    geheim: GEHEIM,
    svixId: 'msg_1',
    svixTimestamp: String(NU),
    svixSignature: teken('msg_1', NU, BODY),
    body: BODY,
    nuSeconden: NU,
    ...over,
  };
}

describe('handtekening', () => {
  it('laat een correct getekend bericht door', () => {
    expect(verifieerHandtekening(invoer())).toEqual({ ok: true });
  });

  it('weigert als het geheim ontbreekt', () => {
    // Zonder sleutel niets accepteren. Een webhook die ongetekende meldingen
    // slikt laat iedereen de status van een orderbevestiging omzetten.
    const r = verifieerHandtekening(invoer({ geheim: undefined }));
    expect(r).toEqual({ ok: false, reden: 'geen-geheim' });
  });

  it('weigert een gewijzigde body', () => {
    const r = verifieerHandtekening(invoer({ body: BODY.replace('delivered', 'bounced') }));
    expect(r).toEqual({ ok: false, reden: 'handtekening-klopt-niet' });
  });

  it('weigert een handtekening die met een ander geheim is gezet', () => {
    const ander = 'whsec_' + Buffer.from('een-heel-ander-geheim-abcdefghij').toString('base64');
    const r = verifieerHandtekening(invoer({ svixSignature: teken('msg_1', NU, BODY, ander) }));
    expect(r).toEqual({ ok: false, reden: 'handtekening-klopt-niet' });
  });

  it('weigert als de svix-id niet die uit de handtekening is', () => {
    // De id zit in de ondertekende tekst, dus hergebruik van een handtekening
    // onder een andere id hoort te falen.
    const r = verifieerHandtekening(invoer({ svixId: 'msg_2' }));
    expect(r).toEqual({ ok: false, reden: 'handtekening-klopt-niet' });
  });

  it.each([
    ['svixId', { svixId: null }],
    ['svixTimestamp', { svixTimestamp: null }],
    ['svixSignature', { svixSignature: null }],
  ])('weigert als %s ontbreekt', (_naam, over) => {
    expect(verifieerHandtekening(invoer(over as any))).toEqual({ ok: false, reden: 'kop-ontbreekt' });
  });

  it('weigert een tijdstempel die te oud is', () => {
    const oud = NU - TIJDSPELING_SECONDEN - 1;
    const r = verifieerHandtekening(invoer({
      svixTimestamp: String(oud), svixSignature: teken('msg_1', oud, BODY),
    }));
    expect(r).toEqual({ ok: false, reden: 'tijdstempel-buiten-venster' });
  });

  it('weigert een tijdstempel ver in de toekomst', () => {
    // Alleen op "te oud" toetsen laat een bericht met een tijdstempel in de
    // toekomst eindeloos geldig blijven.
    const straks = NU + TIJDSPELING_SECONDEN + 1;
    const r = verifieerHandtekening(invoer({
      svixTimestamp: String(straks), svixSignature: teken('msg_1', straks, BODY),
    }));
    expect(r).toEqual({ ok: false, reden: 'tijdstempel-buiten-venster' });
  });

  it('accepteert een geldige handtekening tussen meerdere', () => {
    // Zo ziet een sleutelrotatie eruit: Svix tekent tijdelijk met oud en nieuw.
    const rommel = 'v1,' + Buffer.from('klopt niet').toString('base64');
    const r = verifieerHandtekening(invoer({
      svixSignature: `${rommel} ${teken('msg_1', NU, BODY)}`,
    }));
    expect(r).toEqual({ ok: true });
  });

  it('valt niet om op een handtekening met afwijkende lengte', () => {
    // timingSafeEqual gooit op ongelijke bytelengte in plaats van false terug
    // te geven. Zonder lengtecontrole geeft deze route dan een 500 op een
    // bericht dat gewoon niet klopt.
    const kort = 'v1,' + Buffer.from('kort').toString('base64');
    expect(() => verifieerHandtekening(invoer({ svixSignature: kort }))).not.toThrow();
    expect(verifieerHandtekening(invoer({ svixSignature: kort }))).toEqual({
      ok: false, reden: 'handtekening-klopt-niet',
    });
  });

  it('negeert een onbekende handtekeningversie', () => {
    const v2 = 'v2,' + Buffer.from('toekomst').toString('base64');
    expect(verifieerHandtekening(invoer({ svixSignature: v2 }))).toEqual({
      ok: false, reden: 'handtekening-klopt-niet',
    });
  });
});

describe('duiding van gebeurtenissen', () => {
  it.each([
    ['email.sent', 'verstuurd', false],
    ['email.delivered', 'afgeleverd', false],
    ['email.delivery_delayed', 'vertraagd', false],
    ['email.bounced', 'gebounced', true],
    ['email.failed', 'gebounced', true],
    ['email.complained', 'spamklacht', true],
  ])('%s wordt %s (alarm: %s)', (soort, aflevering, alarm) => {
    expect(duidGebeurtenis(soort as string)).toEqual({ aflevering, alarm });
  });

  it('duidt opens en clicks niet', () => {
    // Die vereisen een trackingpixel en herschreven links. Ze worden wel
    // vastgelegd, maar veranderen de stand niet.
    expect(duidGebeurtenis('email.opened')).toBeNull();
    expect(duidGebeurtenis('email.clicked')).toBeNull();
    expect(duidGebeurtenis('iets.nieuws')).toBeNull();
  });
});

describe('stand alleen opwaarts bijwerken', () => {
  it('werkt bij van onbekend naar afgeleverd', () => {
    expect(magBijwerken('onbekend', 'afgeleverd')).toBe(true);
    expect(magBijwerken(null, 'verstuurd')).toBe(true);
  });

  it('zet afgeleverd niet terug naar verstuurd', () => {
    // Webhooks komen niet gegarandeerd op volgorde binnen. Zonder rangorde zou
    // een email.sent die na email.delivered aankomt de stand verslechteren.
    expect(magBijwerken('afgeleverd', 'verstuurd')).toBe(false);
  });

  it('laat een spamklacht boven een aflevering staan', () => {
    expect(magBijwerken('afgeleverd', 'spamklacht')).toBe(true);
  });

  it('laat een bounce niet overschrijven door een latere aflevering', () => {
    expect(magBijwerken('gebounced', 'afgeleverd')).toBe(false);
  });

  it('werkt niet bij op dezelfde stand', () => {
    // Anders zou een herhaalde gebeurtenis het tijdstip blijven verzetten.
    expect(magBijwerken('afgeleverd', 'afgeleverd')).toBe(false);
  });

  it('behandelt een onbekende bestaande waarde als de laagste', () => {
    expect(magBijwerken('iets-raars', 'verstuurd')).toBe(true);
  });

  it('heeft voor elke stand een rang', () => {
    const standen: Aflevering[] = [
      'onbekend', 'verstuurd', 'vertraagd', 'afgeleverd', 'gebounced', 'spamklacht',
    ];
    for (const s of standen) expect(typeof AFLEVERING_RANG[s]).toBe('number');
    // De rangen moeten uniek zijn, anders wint bij gelijkspel niets.
    const waarden = standen.map((s) => AFLEVERING_RANG[s]);
    expect(new Set(waarden).size).toBe(standen.length);
  });
});

describe('velden uit het bericht lezen', () => {
  it('leest de bouncereden', () => {
    expect(leesDetail({ bounce: { message: 'mailbox unavailable' } })).toBe('mailbox unavailable');
  });

  it('valt terug op een ander veld als message ontbreekt', () => {
    expect(leesDetail({ bounce: { subType: 'suppressed' } })).toBe('suppressed');
    expect(leesDetail({ reason: 'geweigerd' })).toBe('geweigerd');
  });

  it('geeft null als er niets bruikbaars staat', () => {
    expect(leesDetail({})).toBeNull();
    expect(leesDetail(null)).toBeNull();
    expect(leesDetail({ bounce: { message: '   ' } })).toBeNull();
  });

  it('kapt een heel lange reden af', () => {
    expect(leesDetail({ reason: 'x'.repeat(900) })?.length).toBe(500);
  });

  it('leest de ontvanger uit zowel een string als een lijst', () => {
    expect(leesOntvanger({ to: 'a@b.nl' })).toBe('a@b.nl');
    expect(leesOntvanger({ to: ['a@b.nl', 'c@d.nl'] })).toBe('a@b.nl');
    expect(leesOntvanger({})).toBeNull();
  });
});
