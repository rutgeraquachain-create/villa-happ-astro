/**
 * De regels rond aanmelden, bevestigen en uitschrijven.
 *
 * Aanleiding: op 1 september 2026 stonden er vier inschrijvingen in de database,
 * alle vier onbevestigd. De kolom `confirmed` bestond, maar werd nergens op true
 * gezet en er was geen uitschrijfroute. De aanmeldpagina meldde intussen
 * "Bedankt voor je inschrijving". Vier mensen dachten dus dat ze op een lijst
 * stonden die niemand mocht gebruiken.
 *
 * Deze tests bewaken de drie dingen die dat mogelijk maakten: de toestand van
 * een inschrijving, de scheiding tussen de twee soorten links, en het feit dat
 * een adres altijd op dezelfde manier geschreven wordt.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  normaliseerEmail,
  inschrijfstand,
  magOntvangen,
  bevestigUrl,
  afmeldUrl,
  emailUitToken,
} from '../src/lib/nieuwsbrief';

const ORIGIN = 'https://villahapp.nl';

beforeAll(() => {
  // De tokenmodule weigert te werken zonder secret, en terecht. Zelfde
  // aanpak als tests/order-token.test.ts.
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(48));
});

describe('adressen normaliseren', () => {
  it('maakt hoofdletters en spaties onschadelijk', () => {
    expect(normaliseerEmail('  Geoffrey@Voorbeeld.NL ')).toBe('geoffrey@voorbeeld.nl');
  });

  it('laat hetzelfde adres in twee schrijfwijzen op één rij uitkomen', () => {
    // Zonder dit staat iemand twee keer op de lijst en schrijft hij zich maar
    // één keer uit.
    expect(normaliseerEmail('A@B.nl')).toBe(normaliseerEmail('a@b.NL'));
  });
});

describe('toestand van een inschrijving', () => {
  it('kent een onbekend adres als nieuw', () => {
    expect(inschrijfstand(null)).toBe('nieuw');
    expect(inschrijfstand(undefined)).toBe('nieuw');
  });

  it('wacht op bevestiging zolang confirmed false is', () => {
    expect(inschrijfstand({ confirmed: false, unsubscribed_at: null })).toBe('wacht-op-bevestiging');
  });

  it('is actief na bevestiging', () => {
    expect(inschrijfstand({ confirmed: true, unsubscribed_at: null })).toBe('actief');
  });

  it('laat uitgeschreven winnen van bevestigd', () => {
    // De volgorde is de hele reden dat dit een functie is. Iemand die zich
    // uitschreef en daarna het formulier opnieuw invult, mag niet stilzwijgend
    // terugkeren op de lijst.
    expect(inschrijfstand({ confirmed: true, unsubscribed_at: '2026-09-01T10:00:00Z' })).toBe('uitgeschreven');
  });

  it('laat alleen een actieve inschrijving mail ontvangen', () => {
    expect(magOntvangen({ confirmed: true, unsubscribed_at: null })).toBe(true);
    expect(magOntvangen({ confirmed: false, unsubscribed_at: null })).toBe(false);
    expect(magOntvangen({ confirmed: true, unsubscribed_at: '2026-09-01T10:00:00Z' })).toBe(false);
    expect(magOntvangen(null)).toBe(false);
  });
});

describe('links', () => {
  it('draagt het adres genormaliseerd in het token', () => {
    const url = bevestigUrl(ORIGIN, '  Anouk@Voorbeeld.NL ');
    const t = new URL(url).searchParams.get('t');
    expect(emailUitToken(t, 'aanmelding')).toBe('anouk@voorbeeld.nl');
  });

  it('houdt aanmelden en afmelden strikt gescheiden', () => {
    // Cryptografisch afgedwongen via een eigen afgeleide sleutel per publiek.
    // Een uitschrijflink mag nooit iemand kunnen aanmelden en andersom.
    const aan = new URL(bevestigUrl(ORIGIN, 'a@b.nl')).searchParams.get('t');
    const af = new URL(afmeldUrl(ORIGIN, 'a@b.nl')).searchParams.get('t');

    expect(emailUitToken(aan, 'aanmelding')).toBe('a@b.nl');
    expect(emailUitToken(aan, 'afmelding')).toBeNull();

    expect(emailUitToken(af, 'afmelding')).toBe('a@b.nl');
    expect(emailUitToken(af, 'aanmelding')).toBeNull();
  });

  it('weigert een geknoeid token', () => {
    const t = new URL(bevestigUrl(ORIGIN, 'a@b.nl')).searchParams.get('t')!;
    const geknoeid = t.replace('a@b.nl', 'c@d.nl');
    expect(emailUitToken(geknoeid, 'aanmelding')).toBeNull();
    expect(emailUitToken('onzin', 'aanmelding')).toBeNull();
    expect(emailUitToken('', 'aanmelding')).toBeNull();
    expect(emailUitToken(null, 'aanmelding')).toBeNull();
  });

  it('laat een bevestigingslink na een week vervallen', () => {
    const nu = Date.UTC(2026, 8, 1);
    const t = new URL(bevestigUrl(ORIGIN, 'a@b.nl', nu)).searchParams.get('t');
    const zesDagen = nu + 6 * 864e5;
    const achtDagen = nu + 8 * 864e5;
    expect(emailUitToken(t, 'aanmelding', zesDagen)).toBe('a@b.nl');
    expect(emailUitToken(t, 'aanmelding', achtDagen)).toBeNull();
  });

  it('laat een uitschrijflink praktisch nooit vervallen', () => {
    // Een vervallen uitschrijflink laat iemand met een spamklacht als enige
    // uitweg achter. Vijf jaar later moet hij het nog doen.
    const nu = Date.UTC(2026, 8, 1);
    const t = new URL(afmeldUrl(ORIGIN, 'a@b.nl', nu)).searchParams.get('t');
    const vijfJaarLater = nu + 5 * 365 * 864e5;
    expect(emailUitToken(t, 'afmelding', vijfJaarLater)).toBe('a@b.nl');
  });

  it('wijst naar de juiste pagina', () => {
    expect(bevestigUrl(ORIGIN, 'a@b.nl')).toContain('/nieuwsbrief/bevestigen?t=');
    expect(afmeldUrl(ORIGIN, 'a@b.nl')).toContain('/nieuwsbrief/afmelden?t=');
  });
});
