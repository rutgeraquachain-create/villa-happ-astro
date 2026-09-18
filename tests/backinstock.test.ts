import { describe, it, expect } from 'vitest';
import { dueNotifications, stockKey, voorraadPerKeuze, type PendingNotification } from '../src/lib/backinstock';
import { renderBackInStock } from '../src/lib/mail';

const row = (id: string, slug: string, size: string | null, email = 'a@b.nl'): PendingNotification =>
  ({ id, product_slug: slug, size, email });

describe('stockKey', () => {
  it('behandelt null, undefined en lege maat gelijk', () => {
    expect(stockKey('cap', null)).toBe('cap|');
    expect(stockKey('cap', undefined)).toBe('cap|');
    expect(stockKey('cap', '')).toBe('cap|');
    expect(stockKey('hoodie', 'M')).toBe('hoodie|M');
  });
});

describe('dueNotifications', () => {
  const stock = {
    [stockKey('hoodie', 'M')]: 3,
    [stockKey('hoodie', 'L')]: 0,
    [stockKey('cap', 'One size')]: 12,
  };

  it('selecteert alleen rijen waarvan de maat weer beschikbaar is', () => {
    const pending = [row('1', 'hoodie', 'M'), row('2', 'hoodie', 'L'), row('3', 'cap', 'One size')];
    expect(dueNotifications(pending, stock).map((r) => r.id)).toEqual(['1', '3']);
  });

  it('kent onbekende producten of maten geen voorraad toe', () => {
    const pending = [row('1', 'bestaat-niet', 'M'), row('2', 'hoodie', 'XXL')];
    expect(dueNotifications(pending, stock)).toEqual([]);
  });

  it('respecteert het plafond per run (oudste eerst, volgorde behouden)', () => {
    const pending = Array.from({ length: 10 }, (_, i) => row(String(i), 'cap', 'One size'));
    const due = dueNotifications(pending, stock, 4);
    expect(due).toHaveLength(4);
    expect(due.map((r) => r.id)).toEqual(['0', '1', '2', '3']);
  });

  it('lege wachtrij geeft lege lijst', () => {
    expect(dueNotifications([], stock)).toEqual([]);
  });
});

describe('voorraadPerKeuze', () => {
  const inv = (quantity: number, reserved = 0) => ({ quantity, reserved });
  const producten = [
    {
      slug: 'hoodie',
      product_variants: [
        { size: 'M', color: 'Navy', inventory: inv(3) },
        { size: 'L', color: 'Navy', inventory: inv(0) },
      ],
    },
    {
      slug: 'fles',
      product_variants: [
        { size: '650 ml', color: 'Black', inventory: inv(5) },
        { size: '650 ml', color: 'Coral', inventory: inv(0) },
      ],
    },
  ];

  it('houdt de maatsleutels van een hoodie zoals ze waren', () => {
    const { beschikbaar, soort } = voorraadPerKeuze(producten);
    expect(beschikbaar[stockKey('hoodie', 'M')]).toBe(3);
    expect(beschikbaar[stockKey('hoodie', 'L')]).toBe(0);
    expect(soort[stockKey('hoodie', 'M')]).toBe('maat');
    expect(beschikbaar[stockKey('hoodie', 'Navy')]).toBeUndefined();
  });

  /**
   * Op maat alleen vielen de kleuren samen onder "650 ml" en won de laatste
   * rij. Een melding voor Coral zou dan afgaan of juist nooit, afhankelijk van
   * welke kleur toevallig als laatste uit de database kwam.
   */
  it('houdt de kleuren van de fles uit elkaar', () => {
    const { beschikbaar, soort } = voorraadPerKeuze(producten);
    expect(beschikbaar[stockKey('fles', 'Black')]).toBe(5);
    expect(beschikbaar[stockKey('fles', 'Coral')]).toBe(0);
    expect(soort[stockKey('fles', 'Coral')]).toBe('kleur');
    const pending = [row('1', 'fles', 'Coral'), row('2', 'fles', 'Black')];
    expect(dueNotifications(pending, beschikbaar).map((r) => r.id)).toEqual(['2']);
  });

  it('noemt in de mail een kleur een kleur', () => {
    const { subject, html } = renderBackInStock('Fles', 'Coral', 'https://villahapp.nl/shop/fles', 'kleur');
    expect(html).toContain('in de kleur Coral');
    expect(html).not.toContain('maat Coral');
    expect(subject).toBe('Terug op voorraad: Fles (Coral)');
    // De hoodie houdt zijn tekst.
    expect(renderBackInStock('Hoodie', 'M', 'https://villahapp.nl/shop/h').subject).toBe('Terug op voorraad: Hoodie (maat M)');
  });
});
