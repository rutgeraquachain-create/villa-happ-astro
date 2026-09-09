/**
 * Villa Happ — beheerlaag (server-only)
 *
 * Toegangspoort en queries voor het beheerportaal. Alles wat hier binnenkomt
 * gaat eerst langs `vereisBeheer`, ook de leesroutes: een orderlijst bevat
 * namen, adressen en bedragen van klanten.
 *
 * Autorisatiepatroon uit prWize Core: een afwijzing geeft een 404, geen 403.
 * Een 403 bevestigt dat er iets te vinden is op dat adres; dat wil je een
 * bezoeker die er niets te zoeken heeft niet vertellen.
 */

import type { APIContext } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabase';
import { BEHEER_COOKIE, leesBeheerSessie, beheerGeconfigureerd } from './beheer-sessie';

export interface BeheerContext {
  sb: SupabaseClient;
  sessieCookie: string;
}

/**
 * Geeft de beheercontext, of een Response die je meteen moet teruggeven.
 * Zo kan een route nooit "vergeten" te controleren: je krijgt de database
 * pas als de sessie klopt.
 */
/**
 * Controleert alleen de sessie. Geeft het sessiecookie terug, of een 404.
 *
 * Bewust los van de databasecheck: de volgorde moet sessie, dan CSRF, dan
 * database zijn. Zat de databasecheck in dezelfde stap, dan gaf een
 * verkeerd CSRF-token een 503 "geen database" in plaats van een 403, en was
 * niet te zien of de CSRF-poort überhaupt dichtstond.
 */
export function vereisSessie(
  ctx: APIContext,
): { ok: true; sessieCookie: string } | { ok: false; respons: Response } {
  const nietGevonden = () =>
    new Response('Niet gevonden', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  if (!beheerGeconfigureerd()) return { ok: false, respons: nietGevonden() };

  const cookie = ctx.cookies.get(BEHEER_COOKIE)?.value;
  if (!leesBeheerSessie(cookie)) return { ok: false, respons: nietGevonden() };

  return { ok: true, sessieCookie: cookie! };
}

/** De database, of een 503. Roep dit pas aan nadat sessie en CSRF kloppen. */
export function vereisDatabase(): { ok: true; sb: SupabaseClient } | { ok: false; respons: Response } {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return {
      ok: false,
      respons: new Response(JSON.stringify({ error: 'Geen database gekoppeld.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }),
    };
  }
  return { ok: true, sb };
}

/**
 * Sessie plus database in één stap, voor leesroutes waar geen CSRF speelt.
 * Zo kan een route nooit "vergeten" te controleren: je krijgt de database
 * pas als de sessie klopt.
 */
export function vereisBeheer(
  ctx: APIContext,
): { ok: true; context: BeheerContext } | { ok: false; respons: Response } {
  const sessie = vereisSessie(ctx);
  if (!sessie.ok) return { ok: false, respons: sessie.respons };
  const db = vereisDatabase();
  if (!db.ok) return { ok: false, respons: db.respons };
  return { ok: true, context: { sb: db.sb, sessieCookie: sessie.sessieCookie } };
}

/** Beheerpagina's mogen nooit in een cache of een index belanden. */
export const BEHEER_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

/* ---------- Queries ---------- */

export interface OrderRij {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  customer_name: string | null;
  customer_email: string;
  total_cents: number;
  refunded_cents: number;
  tracking_number: string | null;
}

export interface OrderFilter {
  status?: string;
  zoek?: string;
  pagina?: number;
}

const PER_PAGINA = 40;

export async function leesOrders(
  sb: SupabaseClient,
  filter: OrderFilter = {},
): Promise<{ rijen: OrderRij[]; totaal: number; pagina: number; paginas: number }> {
  const pagina = Math.max(1, filter.pagina || 1);
  const van = (pagina - 1) * PER_PAGINA;

  let q = sb
    .from('orders')
    .select(
      'id, order_number, created_at, status, payment_status, customer_name, customer_email, total_cents, refunded_cents, tracking_number',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(van, van + PER_PAGINA - 1);

  if (filter.status) q = q.eq('status', filter.status);

  if (filter.zoek) {
    // Alleen op velden die een mens intypt om een bestelling terug te vinden.
    // De waarde gaat als parameter mee, niet in een querystring.
    const term = filter.zoek.replace(/[%,()]/g, '').trim();
    if (term) {
      q = q.or(
        `order_number.ilike.%${term}%,customer_email.ilike.%${term}%,customer_name.ilike.%${term}%`,
      );
    }
  }

  const { data, count } = await q;
  const totaal = count || 0;
  return {
    rijen: (data as OrderRij[]) || [],
    totaal,
    pagina,
    paginas: Math.max(1, Math.ceil(totaal / PER_PAGINA)),
  };
}

export async function leesOrder(sb: SupabaseClient, id: string) {
  // maybeSingle: een onbekend id is een 404, geen 500.
  const { data } = await sb
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', id)
    .maybeSingle();
  return data;
}

/** Kerncijfers voor de kop van het dashboard. */
export async function leesKerncijfers(sb: SupabaseClient) {
  const telling = async (kolom: string, waarde: string) => {
    const { count } = await sb
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq(kolom, waarde);
    return count || 0;
  };

  const [teVerzenden, onderweg, wachtOpBetaling] = await Promise.all([
    telling('status', 'paid'),
    telling('status', 'shipped'),
    telling('status', 'pending'),
  ]);

  // Omzet van de laatste 30 dagen, alleen wat daadwerkelijk betaald is.
  const sinds = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: betaald } = await sb
    .from('orders')
    .select('total_cents, refunded_cents')
    .eq('payment_status', 'paid')
    .gte('created_at', sinds);

  const omzet30 = (betaald || []).reduce(
    (s: number, o: any) => s + (o.total_cents || 0) - (o.refunded_cents || 0),
    0,
  );

  return { teVerzenden, onderweg, wachtOpBetaling, omzet30 };
}

/** Rijen voor de CSV-export. Bewust plat: één regel per orderregel. */
export async function leesExport(sb: SupabaseClient, vanaf?: string) {
  let q = sb
    .from('orders')
    .select('order_number, created_at, status, payment_status, customer_name, customer_email, subtotal_cents, shipping_cents, korting_cents, tegoedbon_code, total_cents, refunded_cents, shipping_address, tracking_number, order_items(product_name, variant_label, sku, quantity, unit_price_cents, total_cents)')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (vanaf) q = q.gte('created_at', vanaf);
  const { data } = await q;
  return data || [];
}
