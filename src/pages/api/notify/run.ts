/**
 * GET /api/notify/run — dagelijkse mailtaak
 *
 * Twee dingen, in deze volgorde:
 *  1. de mail-outbox legen (vangnet voor transactionele mail die bij het
 *     wegschrijven niet meteen weg kon);
 *  2. de back-in-stock-meldingen versturen.
 *
 * Frequentie: één keer per dag is het maximum op Vercel Hobby. Draait het
 * project op Pro, zet de schedule in vercel.json dan op '0 * * * *'. Een
 * orderbevestiging die bij het wegschrijven niet weg kon blijft dan hooguit
 * een uur liggen in plaats van een dag. (Deze toelichting stond eerst in
 * vercel.json zelf; JSON kent geen commentaar en Vercel weigert onbekende
 * sleutels, waardoor elke build faalde.)
 *
 * Draait via de Vercel-cron (zie vercel.json) of handmatig met
 * `Authorization: Bearer <CRON_SECRET>`. Loopt de open meldingen na,
 * mailt iedereen van wie de gevraagde maat weer beschikbaar is en zet
 * notified_at. Idempotent: een gemailde rij komt nooit opnieuw aan bod.
 *
 * Zonder CRON_SECRET is de route bewust dicht (503); zonder Resend-key
 * wordt er niets gemarkeerd, zodat geen melding verloren gaat.
 */

import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { dueNotifications, stockKey, type PendingNotification } from '../../../lib/backinstock';
import { sendBackInStock, isMailConfigured } from '../../../lib/mail';
import { verwerkWachtrij } from '../../../lib/outbox';
import { getSiteOrigin } from '../../../lib/site';

export const prerender = false;

const MAILS_PER_RUN = 50;

export const GET: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  if (!secret) return new Response(JSON.stringify({ error: 'CRON_SECRET niet geconfigureerd' }), { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const sb = getSupabaseAdmin();
  if (!sb) return new Response(JSON.stringify({ error: 'no-db' }), { status: 503 });

  // 1. Eerst de mail-outbox legen.
  //
  // Dit is het vangnet voor transactionele mail. De outbox probeert bij het
  // wegschrijven meteen te versturen, maar hapert Resend op dat moment, dan
  // blijft de orderbevestiging staan. Zonder deze stap wachtte die tot
  // iemand handmatig op de knop in het beheerportaal drukte, en dat weet je
  // alleen als je gaat kijken.
  //
  // Een cron per dag is traag voor een orderbevestiging; de snelle route
  // blijft de directe poging bij het wegschrijven. Draait dit project ooit
  // op Vercel Pro, zet deze cron dan op elk uur (zie vercel.json).
  const outbox = await verwerkWachtrij();

  /**
   * 2. Blijven hangende reserveringen vrijgeven.
   *
   * Klikt een klant het betaalscherm weg, dan blijft zijn voorraad
   * gereserveerd tot Mollie meldt dat de betaling is verlopen. Komt die
   * melding niet aan, bijvoorbeeld doordat de webhook een tijd onbereikbaar
   * was, dan zit die voorraad voorgoed vast. Bij een oplage van 500 stuks
   * zie je dan uitverkocht staan wat gewoon op de plank ligt.
   *
   * Vierentwintig uur is ruim: een iDEAL-betaling verloopt binnen een kwartier
   * en Mollie blijft de webhook langer dan een dag proberen. Wat hier
   * overblijft is dus echt vergeten, geen betaling die nog onderweg is.
   *
   * Draait vóór de voorraadmeldingen, zodat iemand die op een uitverkochte
   * maat wacht in dezelfde run bericht krijgt als die maat hierdoor vrijkomt.
   */
  const { data: opgeruimd, error: oErr } = await sb.rpc('geef_verlopen_reserveringen_vrij', { p_uren: 24 });
  if (oErr) console.error('[cron] vrijgeven van verlopen reserveringen faalde:', oErr);
  const reserveringen = {
    vrijgegeven: Array.isArray(opgeruimd) ? opgeruimd.length : 0,
    orders: Array.isArray(opgeruimd) ? opgeruimd.map((r: any) => r.order_number) : [],
  };

  if (!isMailConfigured()) {
    // Zonder mailkanaal niets markeren: de wachtrij blijft intact
    return new Response(JSON.stringify({
      outbox,
      reserveringen,
      sent: 0,
      skipped: 'mail niet geconfigureerd',
    }), { status: 200 });
  }

  const { data: pending, error: pErr } = await sb
    .from('back_in_stock')
    .select('id, product_slug, size, email')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (pErr) return new Response(JSON.stringify({ outbox, reserveringen, error: 'query failed' }), { status: 500 });
  if (!pending?.length) return new Response(JSON.stringify({ outbox, reserveringen, sent: 0, pending: 0 }), { status: 200 });

  // Voorraad + productnaam per (slug, maat) in één query
  const slugs = [...new Set(pending.map((p: any) => p.product_slug))];
  const { data: products, error: prErr } = await sb
    .from('products')
    .select('slug, name, product_variants(size, inventory(quantity, reserved))')
    .in('slug', slugs)
    .eq('status', 'published');

  if (prErr) return new Response(JSON.stringify({ outbox, reserveringen, error: 'query failed' }), { status: 500 });

  const availableByKey: Record<string, number> = {};
  const nameBySlug: Record<string, string> = {};
  for (const p of (products as any[]) || []) {
    nameBySlug[p.slug] = p.name;
    for (const v of p.product_variants || []) {
      const inv = Array.isArray(v.inventory) ? v.inventory[0] : v.inventory;
      const available = inv ? Math.max(0, (inv.quantity || 0) - (inv.reserved || 0)) : 0;
      availableByKey[stockKey(p.slug, v.size)] = available;
    }
  }

  const due = dueNotifications(pending as PendingNotification[], availableByKey, MAILS_PER_RUN);
  const origin = getSiteOrigin();
  let sent = 0;

  for (const row of due) {
    const ok = await sendBackInStock(
      row.email,
      nameBySlug[row.product_slug] || row.product_slug,
      row.size || '',
      `${origin}/shop/${row.product_slug}`,
    );
    if (ok) {
      await sb.from('back_in_stock').update({ notified_at: new Date().toISOString() }).eq('id', row.id);
      sent++;
    }
  }

  return new Response(JSON.stringify({ outbox, reserveringen, pending: pending.length, due: due.length, sent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
