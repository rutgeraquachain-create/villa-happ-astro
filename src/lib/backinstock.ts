/**
 * Villa Happ — Back-in-stock logica (puur, testbaar)
 *
 * De cron-route (/api/notify/run) bepaalt hiermee welke wachtenden
 * gemaild mogen worden: alleen als de gevraagde maat weer echt
 * beschikbaar is, en met een plafond per run zodat één voorraad-update
 * nooit honderden mails tegelijk lostrekt.
 */

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
