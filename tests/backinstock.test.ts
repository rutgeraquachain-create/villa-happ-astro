import { describe, it, expect } from 'vitest';
import { dueNotifications, stockKey, type PendingNotification } from '../src/lib/backinstock';

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
