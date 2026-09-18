/**
 * Villa Happ — Back-in-stock logica (puur, testbaar)
 *
 * De cron-route (/api/notify/run) bepaalt hiermee welke wachtenden
 * gemaild mogen worden: alleen als de gevraagde maat weer echt
 * beschikbaar is, en met een plafond per run zodat één voorraad-update
 * nooit honderden mails tegelijk lostrekt.
 */

import { kiestOpKleur } from './keuze';

export interface PendingNotification {
  id: string;
  product_slug: string;
  size: string | null;
  email: string;
}

/** Sleutel voor de voorraadmap: product + maat ('' = geen maat/one size). */
export function stockKey(slug: string, size: string | null | undefined): string {
  return `${slug}|${size || ''}`;
}

/** Wat de klant koos toen hij de melding aanvroeg. */
export type Keuze = 'maat' | 'kleur';

interface VoorraadVariant {
  size: string | null;
  color?: string | null;
  inventory: { quantity: number | null; reserved: number | null } | { quantity: number | null; reserved: number | null }[] | null;
}

/**
 * Beschikbare voorraad per (product, keuze), plus welk soort keuze dat is.
 *
 * WAAROM DE KLEUR ERBIJ KWAM
 * De kolom heet `size`, en tot de VANN-fles was dat ook altijd de maat. Bij de
 * fles zijn alle zes varianten "650 ml" en kiest de klant een kleur, dus de
 * productpagina stuurt dan de kleur mee. Op maat alleen zouden de zes kleuren
 * op één sleutel vallen en overschreef de laatste de rest: een melding voor
 * Coral kon dan afgaan omdat Black binnenkwam.
 *
 * Kleursleutels komen er alleen bij een product dat echt op kleur verschilt.
 * Een hoodie houdt precies de sleutels die hij had.
 */
export function voorraadPerKeuze(
  producten: { slug: string; product_variants?: VoorraadVariant[] | null }[],
): { beschikbaar: Record<string, number>; soort: Record<string, Keuze> } {
  const beschikbaar: Record<string, number> = {};
  const soort: Record<string, Keuze> = {};
  for (const p of producten) {
    const varianten = p.product_variants || [];
    const perKleur = kiestOpKleur(varianten);
    for (const v of varianten) {
      const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
      const stuks = inv ? Math.max(0, (inv.quantity || 0) - (inv.reserved || 0)) : 0;
      const sleutel = perKleur ? stockKey(p.slug, v.color) : stockKey(p.slug, v.size);
      beschikbaar[sleutel] = stuks;
      soort[sleutel] = perKleur ? 'kleur' : 'maat';
    }
  }
  return { beschikbaar, soort };
}

export function dueNotifications(
  pending: PendingNotification[],
  availableByKey: Record<string, number>,
  limit = 50,
): PendingNotification[] {
  const due: PendingNotification[] = [];
  for (const row of pending) {
    if (due.length >= limit) break;
    const available = availableByKey[stockKey(row.product_slug, row.size)] || 0;
    if (available > 0) due.push(row);
  }
  return due;
}
