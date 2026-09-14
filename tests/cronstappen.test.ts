/**
 * De cronroute meldt een mislukte stap met een foutstatus.
 *
 * GEMETEN 14 SEPTEMBER 2026. `/api/notify/run` gaf 146 keer 200 in 36 uur. Op
 * logniveau stonden er zeven foutregels in dezelfde periode: de route ving elke
 * mislukte stap af en antwoordde daarna toch 200. Een mislukte claim op de
 * mailwachtrij gaf zelfs geen foutregel, alleen "0 verzonden". Les 0166.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { cronUitslag } from '../src/lib/cronstappen';

const lees = (pad: string) => readFileSync(new URL(`../${pad}`, import.meta.url), 'utf-8');

/** Zonder commentaar, want de toelichtingen citeren de oude code met opzet. */
const zonderCommentaar = (pad: string) =>
  lees(pad).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('cronUitslag', () => {
  it('geeft 200 als elke stap slaagde', () => {
    expect(cronUitslag({ a: { ok: true }, b: { ok: true, melding: 'overgeslagen' } }))
      .toEqual({ status: 200, mislukt: [] });
  });

  it('geeft 500 zodra één stap mislukte, en noemt welke', () => {
    expect(cronUitslag({ wachtrij: { ok: true }, reserveringen: { ok: false, melding: 'Gateway Timeout' } }))
      .toEqual({ status: 500, mislukt: ['reserveringen'] });
  });

  it('geeft 500 als er niets is gecontroleerd', () => {
    // Een lege lijst die groen meldt, is de stilte waar dit bestand tegen bestaat.
    expect(cronUitslag({})).toEqual({ status: 500, mislukt: ['geen-stappen'] });
  });
});

describe('/api/notify/run gebruikt die uitslag', () => {
  const route = zonderCommentaar('src/pages/api/notify/run.ts');
  const handler = route.slice(route.indexOf('const stappen: Stappen'));

  it('kiest na de sleutelcontrole nergens meer zelf een 200', () => {
    expect(handler.length).toBeGreaterThan(500);
    expect(handler).not.toMatch(/status:\s*200/);
    expect(handler).toMatch(/const \{ status, mislukt \} = cronUitslag\(stappen\)/);
  });

  it('elke stap legt zijn uitkomst vast', () => {
    for (const stap of ['wachtrij', 'wachtrijMeting', 'reserveringen', 'voorraadmeldingen']) {
      expect(handler, `stap ${stap} ontbreekt`).toMatch(new RegExp(`stappen\\.${stap}\\s*=`));
    }
  });

  it('een mislukte reserveringsstap telt als mislukt', () => {
    expect(handler).toMatch(/stappen\.reserveringen = oErr \? \{ ok: false/);
  });

  it('de wachtrijstap kijkt of de claim lukte', () => {
    expect(handler).toMatch(/stappen\.wachtrij = outbox\.claimGelukt/);
    expect(handler).toMatch(/stappen\.wachtrijMeting = outbox\.gemeten/);
  });

  it('het markeren van een verstuurde voorraadmelding wordt op fouten gelezen', () => {
    expect(handler).toMatch(/const \{ error: mErr \} = await sb\.from\('back_in_stock'\)\.update/);
    expect(handler).toMatch(/if \(mErr\)/);
  });

  it('elk antwoord na de sleutelcontrole loopt via dezelfde uitgang', () => {
    // Alleen de weigeringen vóór `stappen` mogen een eigen Response bouwen.
    const eigenResponses = handler.match(/new Response\(/g) || [];
    expect(eigenResponses.length).toBe(1);
  });
});

describe('verwerkWachtrij meldt een mislukte claim', () => {
  const outbox = zonderCommentaar('src/lib/outbox.ts');
  const fn = outbox.slice(outbox.indexOf('export async function verwerkWachtrij'));

  it('zet claimGelukt en schrijft een foutregel', () => {
    expect(outbox).toMatch(/claimGelukt: boolean/);
    const tak = fn.slice(fn.indexOf('if (error || !batch)'), fn.indexOf('let verzonden'));
    expect(tak).toMatch(/console\.error\(/);
    expect(tak).toMatch(/claimGelukt: false/);
  });

  it('meldt een gelukte claim als gelukt', () => {
    expect(fn).toMatch(/return \{ verzonden, mislukt, \.\.\.achterstand, claimGelukt: true \}/);
  });
});
