/**
 * Villa Happ — Het Atelier (pure, testbare logica)
 *
 * De "claim-je-nummer"-finale kent bezoekers een nummer toe in de
 * genummerde oplage. Geen I/O hier: alleen het schema en de
 * nummertoewijzing, zodat de API-route en de tests dit delen.
 */

import { z } from 'zod';

/** Oplagegrootte, gelijk aan de eerste genummerde drop (back-cap, 500 stuks). */
export const EDITION = 500;

export const GARMENTS = ['hoodie', 'cap'] as const;
export const COLOURS = ['olijfgroen', 'navy', 'antraciet'] as const;
export type Garment = (typeof GARMENTS)[number];
export type Colour = (typeof COLOURS)[number];

/** Normaliseer initialen: alleen letters, hoofdletters, maximaal drie. */
export function cleanInitials(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

export const ClaimSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(40).optional(),
  garment: z.enum(GARMENTS).optional(),
  colour: z.enum(COLOURS).optional(),
  initials: z.string().max(3).regex(/^[A-Z]*$/).optional(),
});

export type ClaimPayload = z.infer<typeof ClaimSchema>;

/**
 * Volgnummer voor de zoveelste claim. `count` = aantal reeds toegekende
 * nummers. Nummers lopen 1..edition en rollen daarna door naar een
 * volgende oplage, zodat er altijd een nummer te claimen valt.
 */
export function nextNumber(count: number, edition: number = EDITION): number {
  if (!Number.isFinite(count) || count < 0) return 1;
  return (Math.floor(count) % edition) + 1;
}

/** Toon als "042 / 500". */
export function formatEdition(n: number, edition: number = EDITION): string {
  const digits = String(edition).length;
  return `${String(n).padStart(digits, '0')} / ${edition}`;
}

/** Leesbare naam van een geconfigureerd stuk, bv. "Hoodie · Olijfgroen". */
export function describePiece(garment?: string, colour?: string): string {
  const g = garment === 'cap' ? 'Cap' : 'Hoodie';
  const c = colour ? colour.charAt(0).toUpperCase() + colour.slice(1) : 'Olijfgroen';
  return `${g} · ${c}`;
}
