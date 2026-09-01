/**
 * De regels rond het versturen van een mailing.
 *
 * Verzenden is de enige onomkeerbare handeling in dit systeem. Een verkeerde
 * prijs corrigeer je, een verkeerde mail naar driehonderd mensen niet. Deze
 * tests bewaken de drie dingen die dan mis kunnen gaan: dubbel versturen, naar
 * de verkeerde mensen versturen, en versturen zonder uitweg voor de ontvanger.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mailingKopregels } from '../src/lib/mailing';
import { bodyNaarHtml, renderMailing } from '../src/lib/mailing-render';
import { emailUitToken } from '../src/lib/nieuwsbrief';

const ORIGIN = 'https://villahapp.nl';

beforeAll(() => {
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(48));
});

describe('uitschrijfkopregels', () => {
  it('draagt een token dat alleen voor dit adres werkt', () => {
    const kop = mailingKopregels(ORIGIN, 'anouk@voorbeeld.nl');
    const url = new URL(kop['List-Unsubscribe'].replace(/^<|>$/g, ''));
    expect(emailUitToken(url.searchParams.get('t'), 'afmelding')).toBe('anouk@voorbeeld.nl');
  });

  it('wijst naar de POST-route en niet naar de pagina', () => {
    // Gmail stuurt een POST naar deze URL. Wijst hij naar de HTML-pagina, dan
    // krijgt de ontvanger een 404 op zijn uitschrijfknop.
    const kop = mailingKopregels(ORIGIN, 'a@b.nl');
    expect(kop['List-Unsubscribe']).toContain('/api/newsletter/afmelden');
  });

  it('zet de one-click-kopregel die Gmail eist', () => {
    // Zonder deze exacte waarde toont Gmail zijn knop niet (RFC 8058).
    expect(mailingKopregels(ORIGIN, 'a@b.nl')['List-Unsubscribe-Post'])
      .toBe('List-Unsubscribe=One-Click');
  });

  it('geeft twee adressen een verschillend token', () => {
    const een = mailingKopregels(ORIGIN, 'een@voorbeeld.nl')['List-Unsubscribe'];
    const twee = mailingKopregels(ORIGIN, 'twee@voorbeeld.nl')['List-Unsubscribe'];
    expect(een).not.toBe(twee);
  });
});

describe('markdown naar mail-HTML', () => {
  it('maakt van elke lege regel een nieuwe alinea', () => {
    const html = bodyNaarHtml('Eerste alinea.\n\nTweede alinea.');
    expect(html.match(/<p /g)?.length).toBe(2);
  });

  it('ontsnapt HTML uit de brontekst', () => {
    expect(bodyNaarHtml('Prijs < 30 euro')).toContain('&lt; 30');
    expect(bodyNaarHtml('<script>kwaad()</script>')).not.toContain('<script>');
  });

  it('zet links, vet en cursief om', () => {
    const html = bodyNaarHtml('Lees [het verhaal](https://villahapp.nl/story), **echt** *waar*.');
    expect(html).toContain('href="https://villahapp.nl/story"');
    expect(html).toContain('<b>echt</b>');
    expect(html).toContain('<i>waar</i>');
  });

  it('maakt van ## een tussenkop en niet van een gewone regel', () => {
    expect(bodyNaarHtml('## Tussenkop')).toContain('text-transform:uppercase');
    expect(bodyNaarHtml('Gewone regel')).not.toContain('text-transform:uppercase');
  });
});

describe('de mailing zelf', () => {
  const bron = {
    slug: 'proef',
    onderwerp: 'Villa Happ is terug',
    preheader: 'Het verhaal achter het merk.',
    label: 'Eerste bericht',
    titel: 'Fijn dat je er bent.',
    body: 'Een alinea.\n\nEn nog een.',
  };

  it('draagt altijd een uitschrijflink', () => {
    // Een commerciele mailing zonder uitschrijfmogelijkheid mag niet verstuurd
    // worden (art. 11.7 Telecomwet). Daarom geen optie maar een vaste regel.
    const { html } = renderMailing(bron, ORIGIN);
    expect(html).toContain('{{afmeldlink}}');
    expect(html).toMatch(/Uitschrijven/);
  });

  it('laat de plaatshouder staan en vult hem niet zelf in', () => {
    // Het token verschilt per ontvanger. Zou de render hem al invullen, dan
    // bestaat er een versie van de mail met andermans token erin.
    const { html } = renderMailing(bron, ORIGIN);
    expect(html).not.toContain('/nieuwsbrief/afmelden?t=');
  });

  it('noemt afzender en postadres', () => {
    const { html } = renderMailing(bron, ORIGIN);
    expect(html).toContain('Villa Happ Nederland');
    expect(html).toContain('Vijzelweg 18E');
  });

  it('voldoet aan dezelfde Outlook-regels als de transactiemail', () => {
    const { html } = renderMailing({ ...bron, knopTekst: 'Lees verder', knopUrl: ORIGIN }, ORIGIN);
    expect(html).not.toMatch(/\.webp/i);
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)/i);
    // Elke gekleurde cel ook op het bgcolor-attribuut.
    for (const attrs of [...html.matchAll(/<t[dh]([^>]*)>/gi)].map((m) => m[1])) {
      if (!/style="[^"]*background-color\s*:/i.test(attrs)) continue;
      expect(attrs).toMatch(/bgcolor="#[0-9A-Fa-f]{6}"/);
    }
  });

  it('gebruikt het onderwerp uit de bron', () => {
    expect(renderMailing(bron, ORIGIN).subject).toBe('Villa Happ is terug');
  });
});
