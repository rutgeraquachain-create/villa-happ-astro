/**
 * Het aanmeldvinkje bij het afrekenen.
 *
 * Wat hier fout kan gaan is stille schade in twee richtingen. Iemand op de lijst
 * zetten die daar niet om vroeg is een overtreding; iemand er níét op zetten die
 * er wel om vroeg merkt niemand, want er komt geen foutmelding en de mailing die
 * hij mist ziet hij per definitie niet.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import { meldAanViaCheckout } from '../src/lib/nieuwsbrief-checkout';
import { renderOrderConfirmation } from '../src/lib/mail';

beforeAll(() => {
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(48));
});

/**
 * Een test-dubbel dat onthoudt wát er geschreven is en niet alleen dát er
 * geschreven is. Alleen tellen hoe vaak `upsert` werd aangeroepen bewijst niets
 * over de kolommen, en juist daar zit de fout die telt.
 */
function nepDb(bestaand: Record<string, unknown> | null) {
  const geschreven: Record<string, unknown>[] = [];
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: bestaand, error: null }) };
            },
          };
        },
        upsert(rij: Record<string, unknown>) {
          geschreven.push(rij);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as any;
  return { sb, geschreven };
}

describe('aanmelden via het bestelformulier', () => {
  it('doet niets als het vakje niet is aangevinkt', async () => {
    const { sb, geschreven } = nepDb(null);
    expect(await meldAanViaCheckout(sb, 'anouk@example.com', false)).toBe('niet');
    expect(await meldAanViaCheckout(sb, 'anouk@example.com', undefined)).toBe('niet');
    expect(await meldAanViaCheckout(sb, 'anouk@example.com', null)).toBe('niet');
    expect(geschreven).toHaveLength(0);
  });

  it('zet een nieuwe klant meteen als bevestigd op de lijst', async () => {
    const { sb, geschreven } = nepDb(null);
    expect(await meldAanViaCheckout(sb, 'Anouk@Example.com', true)).toBe('toegevoegd');
    expect(geschreven).toHaveLength(1);
    // Kleine letters, anders staat dezelfde persoon twee keer op de lijst en
    // schrijft hij zich maar één keer uit.
    expect(geschreven[0].email).toBe('anouk@example.com');
    expect(geschreven[0].confirmed).toBe(true);
    expect(geschreven[0].confirmed_at).toBeTruthy();
    // De herkomst is het bewijsstuk bij een controle: hier is toestemming gegeven.
    expect(geschreven[0].source).toBe('checkout');
  });

  it('laat iemand die er al actief op staat met rust', async () => {
    const { sb, geschreven } = nepDb({ confirmed: true, unsubscribed_at: null });
    expect(await meldAanViaCheckout(sb, 'anouk@example.com', true)).toBe('stond-er-al');
    expect(geschreven).toHaveLength(0);
  });

  it('haalt een eerdere uitschrijving weg als iemand opnieuw aanvinkt', async () => {
    const { sb, geschreven } = nepDb({ confirmed: true, unsubscribed_at: '2026-08-01T10:00:00Z' });
    expect(await meldAanViaCheckout(sb, 'anouk@example.com', true)).toBe('toegevoegd');
    // Zonder dit leegmaken blijft `inschrijfstand` hem uitgeschreven noemen en
    // doet het vinkje stil niets.
    expect(geschreven[0].unsubscribed_at).toBeNull();
  });

  it('maakt een halve aanmelding af in plaats van er een tweede naast te zetten', async () => {
    const { sb, geschreven } = nepDb({ confirmed: false, unsubscribed_at: null });
    expect(await meldAanViaCheckout(sb, 'anouk@example.com', true)).toBe('toegevoegd');
    expect(geschreven[0].confirmed).toBe(true);
  });

  it('schrijft niets weg bij een adres zonder apenstaartje', async () => {
    const { sb, geschreven } = nepDb(null);
    expect(await meldAanViaCheckout(sb, 'kapot', true)).toBe('niet');
    expect(geschreven).toHaveLength(0);
  });
});

const ORDER = {
  order_number: 'VH-2026-00002',
  customer_email: 'anouk@example.com',
  customer_name: 'Anouk de Wit',
  subtotal_cents: 5995,
  shipping_cents: 495,
  total_cents: 6490,
  order_items: [{ product_name: 'Hoodie', quantity: 1, total_cents: 5995 }],
};

describe('de melding in de bestelbevestiging', () => {
  it('staat erin met een uitschrijflink zodra iemand net is aangemeld', () => {
    const { html } = renderOrderConfirmation({
      ...ORDER,
      nieuwsbriefAfmeldUrl: 'https://villahapp.nl/nieuwsbrief/afmelden?t=abc',
    });
    expect(html).toContain('je staat nu op');
    expect(html).toContain('https://villahapp.nl/nieuwsbrief/afmelden?t=abc');
  });

  /**
   * De hele opt-in bij het afrekenen rust op deze mededeling. Kwam het blok er
   * ook zonder aanmelding in, dan zou de mail iets beweren dat niet gebeurd is;
   * bleef het weg mét aanmelding, dan gebeurt het in stilte. Beide fout, dus
   * beide richtingen staan hier.
   */
  it('blijft weg bij een bestelling zonder aanmelding', () => {
    const { html } = renderOrderConfirmation(ORDER);
    expect(html).not.toContain('je staat nu op');
    expect(html).not.toContain('/nieuwsbrief/afmelden');
  });
});
