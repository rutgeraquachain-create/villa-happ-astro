import { describe, it, expect } from 'vitest';
import { nextNumber, formatEdition, ClaimSchema, EDITION, cleanInitials, describePiece } from '../src/lib/atelier';

describe('nextNumber', () => {
  it('geeft 1 voor de eerste claim', () => {
    expect(nextNumber(0)).toBe(1);
  });
  it('telt netjes door', () => {
    expect(nextNumber(41)).toBe(42);
    expect(nextNumber(EDITION - 1)).toBe(EDITION); // 500e claim = nummer 500
  });
  it('rolt door naar een volgende oplage na het maximum', () => {
    expect(nextNumber(EDITION)).toBe(1);
    expect(nextNumber(EDITION + 41)).toBe(42);
  });
  it('is bestand tegen onzin-invoer', () => {
    expect(nextNumber(-5)).toBe(1);
    expect(nextNumber(NaN)).toBe(1);
    expect(nextNumber(3.9)).toBe(4);
  });
  it('respecteert een aangepaste oplage', () => {
    expect(nextNumber(10, 10)).toBe(1);
    expect(nextNumber(9, 10)).toBe(10);
  });
});

describe('formatEdition', () => {
  it('vult voor met nullen tot de breedte van de oplage', () => {
    expect(formatEdition(42, 500)).toBe('042 / 500');
    expect(formatEdition(7, 500)).toBe('007 / 500');
    expect(formatEdition(500, 500)).toBe('500 / 500');
  });
});

describe('ClaimSchema', () => {
  it('accepteert een geldig e-mailadres', () => {
    expect(ClaimSchema.parse({ email: 'sanne@example.nl' }).email).toBe('sanne@example.nl');
  });
  it('weigert een ongeldig e-mailadres', () => {
    expect(() => ClaimSchema.parse({ email: 'geen-email' })).toThrow();
  });
  it('weigert een kleur buiten de collectie', () => {
    expect(() => ClaimSchema.parse({ email: 'a@b.nl', colour: 'roze' })).toThrow();
  });
  it('kapt geen geldige optionele velden af', () => {
    const p = ClaimSchema.parse({ email: 'a@b.nl', name: 'Sanne', colour: 'navy' });
    expect(p.name).toBe('Sanne');
    expect(p.colour).toBe('navy');
  });
  it('accepteert kledingstuk en initialen', () => {
    const p = ClaimSchema.parse({ email: 'a@b.nl', garment: 'cap', initials: 'GV' });
    expect(p.garment).toBe('cap');
    expect(p.initials).toBe('GV');
  });
  it('weigert een kledingstuk buiten de set en te lange/kleine-letter initialen', () => {
    expect(() => ClaimSchema.parse({ email: 'a@b.nl', garment: 'schoen' })).toThrow();
    expect(() => ClaimSchema.parse({ email: 'a@b.nl', initials: 'ABCD' })).toThrow();
    expect(() => ClaimSchema.parse({ email: 'a@b.nl', initials: 'ab' })).toThrow();
  });
});

describe('cleanInitials', () => {
  it('maakt hoofdletters en houdt maximaal 3 letters', () => {
    expect(cleanInitials('gv')).toBe('GV');
    expect(cleanInitials('geoffrey')).toBe('GEO');
    expect(cleanInitials('a1.b-c d')).toBe('ABC');
    expect(cleanInitials('')).toBe('');
  });
});

describe('describePiece', () => {
  it('formatteert kledingstuk en kleur netjes', () => {
    expect(describePiece('hoodie', 'olijfgroen')).toBe('Hoodie · Olijfgroen');
    expect(describePiece('cap', 'navy')).toBe('Cap · Navy');
    expect(describePiece(undefined, undefined)).toBe('Hoodie · Olijfgroen');
  });
});
