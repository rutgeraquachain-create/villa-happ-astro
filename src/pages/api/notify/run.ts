/**
 * GET /api/notify/run — terugkerende mailtaak
 *
 * Drie dingen, in deze volgorde:
 *  1. de mail-outbox legen (vangnet voor transactionele mail die bij het
 *     wegschrijven niet meteen weg kon);
 *  2. voorraad vrijgeven die langer dan 24 uur gereserveerd staat voor een
 *     betaling die nooit terugmeldde;
 *  3. de back-in-stock-meldingen versturen.
 *
 * (Hier stonden er twee. Stap 2 kwam er later bij en de kop ging niet mee, dus
 * wie alleen dit las, wist niet dat er ook voorraad vastzat als deze route
 * stillag.)
 *
 * Frequentie: elk kwartier (`*​/15 * * * *` in vercel.json). Dat stond tot 9
 * september 2026 op één keer per dag om 08:00, wat het maximum was op Vercel
 * Hobby. Het project draait sinds die maand op Pro, en de herinneringsactie
 * loopt maar drie dagen: een mail die bij het wegschrijven niet weg kon lag
 * met de oude stand tot 24 uur stil, oftewel een derde van de looptijd. Nu
 * hooguit een kwartier, maar pas sinds 11 september 2026: tot die dag stond
 * `CRON_SECRET` niet in productie en gaf elke run 503 (161 in zeven dagen).
 * Zie docs/workflow.md. (Deze toelichting stond eerst in vercel.json zelf;
 * JSON kent geen commentaar en Vercel weigert onbekende sleutels, waardoor
 * elke build faalde.)
 *
 * STATUSCODE: 200 ALLEEN ALS ELKE STAP SLAAGDE
 * Een mislukte stap houdt de andere niet tegen, want als de mail hapert moet
 * de voorraad nog steeds vrijkomen. Maar de route gaf daarna gewoon 200, en
 * dat verborg op 13 en 14 september 2026 zeven foutregels achter 146 keer 200.
 * Nu legt elke stap vast of hij slaagde, en `cronUitslag` (src/lib/cronstappen.ts)
 * maakt er 500 van zodra er één mislukte. Het antwoord noemt welke.
 *
 * Een 500 levert geen extra run op: Vercel start een mislukte cronrun niet
 * opnieuw. Vercel kan wel af en toe dezelfde geplande run twee keer afleveren,
 * los van de status. Daarom moet elke stap een tweede keer veilig zijn:
 *  - de wachtrij claimt met `FOR UPDATE SKIP LOCKED`, verzonden mail komt niet
 *    terug in een batch;
 *  - het vrijgeven van reserveringen sluit de orders die het vrijgeeft, dus een
 *    tweede run vindt ze niet meer;
 *  - een voorraadmelding krijgt `notified_at` ná het versturen. Mislukt dat
 *    markeren, dan gaat de mail de volgende run nog eens. Dat was altijd zo,
 *    alleen gaf het geen enkel signaal; nu telt het als mislukte stap.
 *
 * Draait via de Vercel-cron (zie vercel.json) of handmatig met
 * `Authorization: Bearer <CRON_SECRET>`.
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
import { cronUitslag, type Stappen } from '../../../lib/cronstappen';

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

  const stappen: Stappen = {};

  /**
   * Eén uitgang voor elk antwoord na dit punt, zodat geen enkel pad nog een
   * eigen statuscode kan kiezen. Die vrijheid was precies hoe de route een
   * mislukte stap met 200 kon afmelden.
   */
  const antwoord = (inhoud: Record<string, unknown>) => {
    const { status, mislukt } = cronUitslag(stappen);
    if (mislukt.length) console.error('[cron] Run niet volledig geslaagd, mislukte stappen:', mislukt.join(', '));
    return new Response(JSON.stringify({ ...inhoud, stappen, mislukt }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // 1. Eerst de mail-outbox legen.
  //
  // Dit is het vangnet voor transactionele mail. De outbox probeert bij het
  // wegschrijven meteen te versturen, maar hapert Resend op dat moment, dan
  // blijft de orderbevestiging staan. Zonder deze stap wachtte die tot
  // iemand handmatig op de knop in het beheerportaal drukte, en dat weet je
  // alleen als je gaat kijken.
  //
  // De snelle route blijft de directe poging bij het wegschrijven; deze cron
  // is het vangnet daaronder en draait elk kwartier (zie vercel.json).
  const outbox = await verwerkWachtrij();
  stappen.wachtrij = outbox.claimGelukt
    ? { ok: true }
    : { ok: false, melding: 'claim_outbox_batch mislukte; deze run heeft geen mail geprobeerd' };
  // Het meten van de achterstand is geen verzendwerk, maar het is wel de enige
  // plek waar het beheerscherm zijn waarschuwing vandaan haalt. Een meting die
  // niet lukte en toch groen meldt, is de fout uit les 0158.
  stappen.wachtrijMeting = outbox.gemeten
    ? { ok: true }
    : { ok: false, melding: 'outbox_achterstand mislukte; het beheerscherm toont geen stand' };

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
  stappen.reserveringen = oErr ? { ok: false, melding: oErr.message } : { ok: true };
  const reserveringen = {
    vrijgegeven: Array.isArray(opgeruimd) ? opgeruimd.length : 0,
    orders: Array.isArray(opgeruimd) ? opgeruimd.map((r: any) => r.order_number) : [],
  };

  // 3. Voorraadmeldingen.
  if (!isMailConfigured()) {
    // Zonder mailkanaal niets markeren: de wachtrij blijft intact. Dat is een
    // bewuste stand en geen fout, dus de stap slaagt met die reden erbij.
    stappen.voorraadmeldingen = { ok: true, melding: 'overgeslagen: mail niet geconfigureerd' };
    return antwoord({ outbox, reserveringen, sent: 0 });
  }

  const { data: pending, error: pErr } = await sb
    .from('back_in_stock')
    .select('id, product_slug, size, email')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (pErr) {
    console.error('[cron] Voorraadmeldingen ophalen faalde:', pErr.message);
    stappen.voorraadmeldingen = { ok: false, melding: 'back_in_stock ophalen faalde' };
    return antwoord({ outbox, reserveringen });
  }
  if (!pending?.length) {
    stappen.voorraadmeldingen = { ok: true };
    return antwoord({ outbox, reserveringen, sent: 0, pending: 0 });
  }

  // Voorraad + productnaam per (slug, maat) in één query
  const slugs = [...new Set(pending.map((p: any) => p.product_slug))];
  const { data: products, error: prErr } = await sb
    .from('products')
    .select('slug, name, product_variants(size, inventory(quantity, reserved))')
    .in('slug', slugs)
    .eq('status', 'published');

  if (prErr) {
    console.error('[cron] Producten voor voorraadmeldingen ophalen faalde:', prErr.message);
    stappen.voorraadmeldingen = { ok: false, melding: 'products ophalen faalde' };
    return antwoord({ outbox, reserveringen });
  }

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
  let nietVerstuurd = 0;
  let nietGemarkeerd = 0;

  for (const row of due) {
    const ok = await sendBackInStock(
      row.email,
      nameBySlug[row.product_slug] || row.product_slug,
      row.size || '',
      `${origin}/shop/${row.product_slug}`,
    );
    if (!ok) {
      nietVerstuurd++;
      continue;
    }
    /**
     * Het markeren op fouten lezen. Hier stond een kale `await` op de update.
     * Mislukt die, dan is de mail verstuurd maar staat `notified_at` nog leeg,
     * en krijgt dezelfde klant de volgende run dezelfde mail. Dat blijft zo,
     * want versturen en markeren zijn twee systemen, maar het is nu zichtbaar.
     */
    const { error: mErr } = await sb.from('back_in_stock').update({ notified_at: new Date().toISOString() }).eq('id', row.id);
    if (mErr) {
      console.error('[cron] Voorraadmelding verstuurd maar niet gemarkeerd, gaat opnieuw:', row.id, mErr.message);
      nietGemarkeerd++;
    }
    sent++;
  }

  stappen.voorraadmeldingen = nietVerstuurd || nietGemarkeerd
    ? { ok: false, melding: `${nietVerstuurd} niet verstuurd, ${nietGemarkeerd} verstuurd maar niet gemarkeerd` }
    : { ok: true };

  return antwoord({ outbox, reserveringen, pending: pending.length, due: due.length, sent });
};
