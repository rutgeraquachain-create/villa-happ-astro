/**
 * De CSP moet de adressen toelaten waar de meting echt naartoe stuurt.
 *
 * Gemeten 9 september 2026 op villahapp.nl. Elke `page_view` en elke
 * `view_item` werd geblokkeerd:
 *
 *   Connecting to 'https://region1.google-analytics.com/g/collect?...'
 *   violates the following Content Security Policy directive: "connect-src ..."
 *
 * GA4 stuurt in Europa naar een regionaal adres, `region1.google-analytics.com`.
 * De CSP stond `www.google-analytics.com` en `*.analytics.google.com` toe, en
 * dat zijn twee andere domeinen: het eerste dekt alleen `www`, het tweede gaat
 * over `analytics.google.com` en niet over `google-analytics.com`. Er werd dus
 * niets gemeten, en niemand zag het, want een geblokkeerd meetverzoek geeft
 * alleen een regel in de console van de bezoeker.
 *
 * Deze toets controleert de eigenschap en niet de letterlijke tekst: hij bouwt
 * de adressen na waar de browser echt heen wil en vraagt of de CSP ze toelaat.
 * Een toets op de tekst zou groen blijven als Google morgen `region2` gebruikt.
 */

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const vercelJson = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf-8'),
) as { headers?: { source: string; headers: { key: string; value: string }[] }[] };

const csp = (vercelJson.headers ?? [])
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';

/** De bronnen van één richtlijn, bijvoorbeeld connect-src. */
function bronnen(richtlijn: string): string[] {
  const deel = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(richtlijn + ' '));
  return deel ? deel.split(/\s+/).slice(1) : [];
}

/**
 * Laat de CSP dit adres toe? Alleen de gevallen die hier voorkomen: een exacte
 * herkomst, of één wildcard vooraan zoals `https://*.google-analytics.com`.
 */
function toegestaan(url: string, richtlijn: string): boolean {
  const host = new URL(url).host;
  return bronnen(richtlijn).some((bron) => {
    if (!bron.startsWith('https://')) return false;
    const patroon = bron.slice('https://'.length);
    if (patroon.startsWith('*.')) {
      const achtervoegsel = patroon.slice(1); // ".google-analytics.com"
      return host.endsWith(achtervoegsel);
    }
    return host === patroon;
  });
}

describe('de CSP laat de meting door', () => {
  it('heeft überhaupt een CSP met connect-src, anders bewijst dit niets', () => {
    expect(csp).not.toBe('');
    expect(bronnen('connect-src').length).toBeGreaterThan(2);
  });

  /**
   * De vier adressen die in de meting van 9 september langskwamen of die GA4 in
   * Europa kan kiezen. `region1` is de gemeten; de andere staan erbij omdat
   * Google het regionummer per account en per moment bepaalt, en een CSP die
   * alleen `region1` kent zou morgen weer stil blokkeren.
   */
  it.each([
    'https://region1.google-analytics.com/g/collect',
    'https://region2.google-analytics.com/g/collect',
    'https://www.google-analytics.com/g/collect',
    'https://analytics.google.com/g/collect',
  ])('laat %s toe in connect-src', (url) => {
    expect(toegestaan(url, 'connect-src'), `${url} wordt geblokkeerd`).toBe(true);
  });

  /**
   * De tegenproef. Zonder deze zou een CSP van `connect-src *` deze hele suite
   * groen maken, en dan meet hij niets.
   */
  it('laat een willekeurig vreemd domein niet toe', () => {
    expect(toegestaan('https://tracker.example.com/collect', 'connect-src')).toBe(false);
    expect(toegestaan('https://google-analytics.com.kwaadaardig.nl/x', 'connect-src')).toBe(false);
  });
});
