import { describe, it, expect, beforeAll, vi } from 'vitest';
import { maakOrderToken, leesOrderToken, authSecretOntbreekt } from '../src/lib/order-token';
import {
  hashWachtwoord, controleerWachtwoord,
  maakBeheerSessie, leesBeheerSessie, beheerToegang,
  maakCsrfToken, controleerCsrf,
} from '../src/lib/beheer-sessie';

const ORDER = '11111111-2222-3333-4444-555555555555';

beforeAll(() => {
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(48));
});

describe('capability-token', () => {
  it('leest terug wat het schreef', () => {
    const t = maakOrderToken(ORDER, 'portaal');
    expect(leesOrderToken(t, 'portaal')?.orderId).toBe(ORDER);
  });

  it('weigert een token van een ander publiek', () => {
    // Dit is de kern: de bedanktpagina en het klantportaal tekenen met een
    // eigen afgeleide sleutel, dus hergebruik is cryptografisch onmogelijk.
    const status = maakOrderToken(ORDER, 'status');
    expect(leesOrderToken(status, 'portaal')).toBeNull();
    const portaal = maakOrderToken(ORDER, 'portaal');
    expect(leesOrderToken(portaal, 'status')).toBeNull();
  });

  it('weigert een verlopen token', () => {
    const lang = 24 * 60 * 60 * 1000;
    const t = maakOrderToken(ORDER, 'status', Date.now() - lang - 1000);
    expect(leesOrderToken(t, 'status')).toBeNull();
  });

  it('weigert een gewijzigde payload', () => {
    const t = maakOrderToken(ORDER, 'portaal');
    const [payload, sig] = t.split('.');
    const anderId = payload.replace(ORDER, '99999999-2222-3333-4444-555555555555');
    expect(leesOrderToken(`${anderId}.${sig}`, 'portaal')).toBeNull();
  });

  it('weigert onzin zonder te crashen', () => {
    // Een vervalst token mag nooit een 500 opleveren, alleen een weigering.
    for (const rommel of ['', '.', 'abc', 'a.b', `${ORDER}:1.zz`, 'x'.repeat(500)]) {
      expect(() => leesOrderToken(rommel, 'portaal')).not.toThrow();
      expect(leesOrderToken(rommel, 'portaal')).toBeNull();
    }
    expect(leesOrderToken(undefined, 'portaal')).toBeNull();
    expect(leesOrderToken(null, 'portaal')).toBeNull();
  });
});

describe('beheerwachtwoord', () => {
  it('accepteert het juiste wachtwoord en weigert de rest', () => {
    const hash = hashWachtwoord('een lang genoeg wachtwoord');
    expect(controleerWachtwoord('een lang genoeg wachtwoord', hash)).toBe(true);
    expect(controleerWachtwoord('een lang genoeg wachtwoor', hash)).toBe(false);
    expect(controleerWachtwoord('', hash)).toBe(false);
  });

  it('gebruikt geen $ als scheidingsteken', () => {
    // Een $ in een .env-waarde wordt door dotenv als variabele gelezen en
    // sloopt de salt. Dat kostte een stille 401 bij het juiste wachtwoord.
    const hash = hashWachtwoord('wachtwoord van voldoende lengte');
    expect(hash).not.toContain('$');
    expect(hash.split(':')).toHaveLength(3);
  });

  it('produceert per keer een andere hash (eigen salt)', () => {
    expect(hashWachtwoord('zelfde wachtwoord')).not.toBe(hashWachtwoord('zelfde wachtwoord'));
  });

  it('weigert een kapotte hash zonder te crashen', () => {
    for (const rommel of ['', 'scrypt:', 'scrypt:zz:zz', 'bcrypt:a:b', 'losse tekst', 'scrypt$a$b']) {
      expect(() => controleerWachtwoord('wachtwoord', rommel)).not.toThrow();
      expect(controleerWachtwoord('wachtwoord', rommel)).toBe(false);
    }
  });

  it('weigert een afgekapte hash, ook met het juiste wachtwoord', () => {
    // Dit ging eerder mis. De sleutel werd afgeleid op de lengte van wat was
    // opgeslagen, dus een afgekapte hash vergeleek alleen het stuk dat er nog
    // was en gaf `true`. Een waarde die bij het plakken in een
    // omgevingsvariabele halverwege afbrak, liet het juiste wachtwoord dus
    // door op een fractie van de sterkte; bij vier bytes nog maar 32 bits.
    const ww = 'een lang genoeg wachtwoord';
    const hash = hashWachtwoord(ww);

    for (const lengte of [8, 40, 80, hash.length - 2]) {
      expect(controleerWachtwoord(ww, hash.slice(0, lengte))).toBe(false);
    }
    // En andersom: er mag ook niets achter geplakt zitten.
    expect(controleerWachtwoord(ww, hash + 'ab')).toBe(false);
    expect(controleerWachtwoord(ww, `"${hash}"`)).toBe(false);
    expect(controleerWachtwoord(ww, ` ${hash} `)).toBe(false);

    // De onbeschadigde waarde blijft gewoon werken.
    expect(controleerWachtwoord(ww, hash)).toBe(true);
  });

  it('houdt de vaste lengte aan: scrypt: + 32 hex + : + 64 hex', () => {
    const hash = hashWachtwoord('wachtwoord van voldoende lengte');
    expect(hash).toHaveLength('scrypt:'.length + 32 + 1 + 64);
    const [prefix, salt, digest] = hash.split(':');
    expect(prefix).toBe('scrypt');
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('beheersessie', () => {
  it('leest een geldige sessie', () => {
    expect(leesBeheerSessie(maakBeheerSessie())).toBe(true);
  });

  it('weigert een verlopen sessie', () => {
    const twaalfUur = 12 * 60 * 60 * 1000;
    expect(leesBeheerSessie(maakBeheerSessie(Date.now() - twaalfUur - 1000))).toBe(false);
  });

  it('weigert een ordertoken als sessie', () => {
    // Zelfde AUTH_SECRET, andere afgeleide sleutel: mag nooit passeren.
    expect(leesBeheerSessie(maakOrderToken(ORDER, 'portaal'))).toBe(false);
  });

  it('weigert onzin', () => {
    for (const rommel of ['', 'abc', 'beheer:1.zz', undefined]) {
      expect(leesBeheerSessie(rommel as any)).toBe(false);
    }
  });
});

describe('beheerToegang', () => {
  it('eist een geldige sessie én een geconfigureerd portaal', () => {
    vi.stubEnv('ADMIN_PASSWORD_HASH', hashWachtwoord('geheim'));
    expect(beheerToegang(maakBeheerSessie())).toBe(true);
    expect(beheerToegang('rommel')).toBe(false);
  });

  it('sluit een lopende sessie meteen buiten als de hash weg is', () => {
    // Zo zet je het portaal dicht: haal ADMIN_PASSWORD_HASH weg. Zonder deze
    // eis bleef een cookie dat al liep nog twaalf uur lang bestellingen en
    // voorraad tonen, terwijl de API-routes wél al 404 gaven.
    const sessie = maakBeheerSessie();
    vi.stubEnv('ADMIN_PASSWORD_HASH', hashWachtwoord('geheim'));
    expect(beheerToegang(sessie)).toBe(true);
    vi.stubEnv('ADMIN_PASSWORD_HASH', '');
    expect(beheerToegang(sessie)).toBe(false);
  });
});

describe('csrf', () => {
  it('hoort bij precies één sessie', () => {
    const sessieA = maakBeheerSessie();
    const sessieB = maakBeheerSessie(Date.now() + 1000);
    const token = maakCsrfToken(sessieA);
    expect(controleerCsrf(sessieA, token)).toBe(true);
    expect(controleerCsrf(sessieB, token)).toBe(false);
  });

  it('weigert ontbrekende of onzinnige waarden', () => {
    const sessie = maakBeheerSessie();
    expect(controleerCsrf(sessie, undefined)).toBe(false);
    expect(controleerCsrf(undefined, 'abc')).toBe(false);
    expect(controleerCsrf(sessie, 'niet-hex')).toBe(false);
  });
});

describe('authSecretOntbreekt', () => {
  it('herkent een bruikbaar secret', () => {
    vi.stubEnv('AUTH_SECRET', 'y'.repeat(32));
    expect(authSecretOntbreekt()).toBe(false);
  });

  it('herkent een ontbrekend of te kort secret', () => {
    // Een te kort secret is net zo onbruikbaar als geen secret: het token
    // zou raadbaar worden. Beide moeten de route vroeg laten stoppen.
    vi.stubEnv('AUTH_SECRET', '');
    expect(authSecretOntbreekt()).toBe(true);
    vi.stubEnv('AUTH_SECRET', 'te-kort');
    expect(authSecretOntbreekt()).toBe(true);
    vi.stubEnv('AUTH_SECRET', 'y'.repeat(31));
    expect(authSecretOntbreekt()).toBe(true);
    // en weer terugzetten voor de overige tests
    vi.stubEnv('AUTH_SECRET', 'x'.repeat(48));
  });
});
