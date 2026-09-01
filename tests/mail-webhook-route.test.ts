import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

/**
 * Toetst de route zelf, niet alleen de losse functies.
 *
 * De handtekening staat al in mail-webhook.test.ts. Hier gaat het om wat de
 * route ermee doet: koppelen aan de juiste rij, idempotent zijn bij herhaling,
 * de stand alleen opwaarts bijwerken, en alarm slaan zonder in een lus te
 * belanden. Dat zijn precies de gedragingen die bij een echte bounce moeten
 * kloppen en die je niet wilt ontdekken op het moment dat het misgaat.
 *
 * De database wordt nagebootst. Draaien tegen de echte database zou rijen in
 * een append-only logboek achterlaten en productie vervuilen.
 */

const GEHEIM = 'whsec_' + Buffer.from('route-test-sleutel-abcdefghijklmn').toString('base64');

function teken(id: string, ts: number, body: string) {
  const sleutel = Buffer.from(GEHEIM.replace(/^whsec_/, ''), 'base64');
  return 'v1,' + createHmac('sha256', sleutel).update(`${id}.${ts}.${body}`).digest('base64');
}

/** Rij zoals de webhook hem vindt. */
const RIJ = {
  id: 'rij-1',
  soort: 'winkelier-nieuwe-order',
  ontvanger: 'contact@villahapp.nl',
  onderwerp: 'Nieuwe bestelling VH-2026-00042',
  aflevering: 'verstuurd',
};

interface Opzet {
  rij?: any;
  insertFout?: { code?: string; message?: string } | null;
}

/** Minimale Supabase-nabootsing die de aanroepen van de route vastlegt. */
function maakDb(opzet: Opzet = {}) {
  const log = { ingevoegd: [] as any[], bijgewerkt: [] as any[] };
  const client = {
    from(tabel: string) {
      if (tabel === 'mail_gebeurtenissen') {
        return {
          insert(rij: any) {
            log.ingevoegd.push(rij);
            return Promise.resolve({ error: opzet.insertFout ?? null });
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: 'rij' in opzet ? opzet.rij : RIJ, error: null,
            }),
          }),
        }),
        update(waarden: any) {
          log.bijgewerkt.push(waarden);
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
  };
  return { client, log };
}

// Het argument staat er expliciet in. Zonder parameter leidt vitest het type
// af als "neemt niets aan", en dan zijn zowel de aanroep als mock.calls[0][0]
// een typefout terwijl de test gewoon draait.
const wachtrij = vi.fn(async (_mail: any) => ({ vastgelegd: true, verzonden: false }));
let db = maakDb();

vi.mock('../src/lib/supabase', () => ({ getSupabaseAdmin: () => db.client }));
vi.mock('../src/lib/outbox', () => ({ zetInWachtrij: (m: any) => wachtrij(m) }));
vi.mock('../src/lib/site', () => ({ getSiteOrigin: () => 'https://villahapp.nl' }));

/**
 * De route leest RESEND_WEBHOOK_SECRET op moduleniveau, dus stubben moet vóór
 * het importeren. Daarom een verse import per test in plaats van bovenaan.
 */
async function laadRoute(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv('RESEND_WEBHOOK_SECRET', GEHEIM);
  vi.stubEnv('MAIL_ALARM_NAAR', 'rutgervanhappen@gmail.com');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import('../src/pages/api/mail/webhook')).POST;
}

function verzoek(body: string, over: Record<string, string | null> = {}) {
  const ts = Math.floor(Date.now() / 1000);
  const koppen: Record<string, string> = {
    'svix-id': 'msg_a',
    'svix-timestamp': String(ts),
    'svix-signature': teken('msg_a', ts, body),
  };
  for (const [k, v] of Object.entries(over)) {
    if (v === null) delete koppen[k]; else koppen[k] = v;
  }
  return { request: new Request('https://villahapp.nl/api/mail/webhook', {
    method: 'POST', headers: koppen, body,
  }) } as any;
}

const gebeurtenis = (type: string, over: any = {}) => JSON.stringify({
  type,
  data: { email_id: 'resend-abc', to: ['contact@villahapp.nl'], ...over },
});

beforeEach(() => { db = maakDb(); wachtrij.mockClear(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('POST /api/mail/webhook', () => {
  it('weigert zonder geldige handtekening', async () => {
    const POST = await laadRoute();
    const body = gebeurtenis('email.delivered');
    const res = await POST(verzoek(body, { 'svix-signature': 'v1,onzin' }));
    expect(res.status).toBe(401);
    // Niets vastgelegd: een ongetekend bericht mag geen spoor achterlaten.
    expect(db.log.ingevoegd).toHaveLength(0);
    expect(db.log.bijgewerkt).toHaveLength(0);
  });

  it('geeft 503 zonder ingesteld geheim', async () => {
    vi.resetModules();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    const POST = (await import('../src/pages/api/mail/webhook')).POST;
    const res = await POST(verzoek(gebeurtenis('email.delivered')));
    expect(res.status).toBe(503);
  });

  it('legt een aflevering vast en werkt de stand bij', async () => {
    const POST = await laadRoute();
    const res = await POST(verzoek(gebeurtenis('email.delivered')));
    expect(res.status).toBe(200);
    expect(db.log.ingevoegd[0]).toMatchObject({
      mail_id: 'rij-1', provider_id: 'resend-abc', soort: 'email.delivered',
    });
    expect(db.log.bijgewerkt[0]).toMatchObject({ aflevering: 'afgeleverd' });
    expect(wachtrij).not.toHaveBeenCalled();
  });

  it('slaat alarm bij een bounce en zet de reden erbij', async () => {
    const POST = await laadRoute();
    const body = gebeurtenis('email.bounced', { bounce: { message: 'mailbox unavailable' } });
    const res = await POST(verzoek(body));
    expect(res.status).toBe(200);
    expect(db.log.bijgewerkt[0]).toMatchObject({
      aflevering: 'gebounced', aflevering_detail: 'mailbox unavailable',
    });
    expect(wachtrij).toHaveBeenCalledTimes(1);
    const alarm = wachtrij.mock.calls[0][0] as any;
    expect(alarm.ontvanger).toBe('rutgervanhappen@gmail.com');
    expect(alarm.soort).toBe('mail-alarm');
    // Ontdubbeld per mail en per stand, zodat twee gebeurtenissen over
    // dezelfde mail niet twee meldingen opleveren.
    expect(alarm.dedupeSleutel).toBe('mail-alarm:rij-1:gebounced');
  });

  it('stuurt het alarm nooit naar het adres dat de storing heeft', async () => {
    const POST = await laadRoute();
    await POST(verzoek(gebeurtenis('email.bounced')));
    const alarm = wachtrij.mock.calls[0][0] as any;
    expect(alarm.ontvanger).not.toBe('contact@villahapp.nl');
  });

  it('alarmeert niet over een alarmmail die zelf bounct', async () => {
    // Zonder deze grens bounct het alarm, levert dat een nieuw alarm op, dat
    // weer bounct, en zo verder.
    db = maakDb({ rij: { ...RIJ, soort: 'mail-alarm', ontvanger: 'rutgervanhappen@gmail.com' } });
    const POST = await laadRoute();
    const res = await POST(verzoek(gebeurtenis('email.bounced')));
    expect(res.status).toBe(200);
    expect(wachtrij).not.toHaveBeenCalled();
  });

  it('is idempotent bij een herhaalde levering', async () => {
    // Svix probeert opnieuw als ons antwoord niet aankwam. De unieke svix_id
    // botst dan; dat is geen fout en mag geen tweede alarm opleveren.
    db = maakDb({ insertFout: { code: '23505', message: 'duplicate key' } });
    const POST = await laadRoute();
    const res = await POST(verzoek(gebeurtenis('email.bounced')));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ herhaling: true });
    expect(db.log.bijgewerkt).toHaveLength(0);
    expect(wachtrij).not.toHaveBeenCalled();
  });

  it('zet de stand niet terug bij een gebeurtenis buiten volgorde', async () => {
    // email.sent die ná email.delivered binnenkomt mag de stand niet
    // verslechteren.
    db = maakDb({ rij: { ...RIJ, aflevering: 'afgeleverd' } });
    const POST = await laadRoute();
    const res = await POST(verzoek(gebeurtenis('email.sent')));
    expect(res.status).toBe(200);
    expect(db.log.ingevoegd).toHaveLength(1);   // wel gelogd
    expect(db.log.bijgewerkt).toHaveLength(0);  // niet bijgewerkt
  });

  it('legt een onbekende soort vast zonder de stand te raken', async () => {
    const POST = await laadRoute();
    const res = await POST(verzoek(gebeurtenis('email.opened')));
    expect(res.status).toBe(200);
    expect(db.log.ingevoegd).toHaveLength(1);
    expect(db.log.bijgewerkt).toHaveLength(0);
  });

  it('legt een gebeurtenis vast die bij geen enkele rij hoort', async () => {
    // Mail die met de hand vanuit het Resend-dashboard is verstuurd hoort ook
    // in het logboek, in plaats van weggegooid te worden.
    db = maakDb({ rij: null });
    const POST = await laadRoute();
    const res = await POST(verzoek(gebeurtenis('email.bounced')));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ gekoppeld: false });
    expect(db.log.ingevoegd).toHaveLength(1);
    expect(wachtrij).not.toHaveBeenCalled();
  });

  it('geeft 400 op een onleesbare body', async () => {
    const POST = await laadRoute();
    const res = await POST(verzoek('dit is geen json'));
    expect(res.status).toBe(400);
  });
});
