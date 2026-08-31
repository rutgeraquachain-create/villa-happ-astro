/**
 * Regels waar transactiemail aan moet voldoen.
 *
 * Aanleiding: de eerste echte bestelling, VH-2026-00001 op 25 augustus 2026.
 * De knop "Volg je bestelling" stond in Outlook als donkere tekst op donker,
 * omdat de Word-engine een CSS-achtergrond op een `<a>` weggooit. Niemand had
 * die mail ooit bekeken, want je kreeg hem pas na af te rekenen.
 *
 * Waarom tests en geen handmatige controle: een mailclient is niet te openen
 * vanuit CI, en de fout zit niet in de tekst maar in de bouwwijze. Deze tests
 * controleren precies die bouwwijze, op elke mail tegelijk. Bekijken kan met de
 * route /dev/mail, die dezelfde voorbeelddata gebruikt.
 */

import { describe, it, expect } from 'vitest';
import { voorbeeldMails } from '../src/lib/mail-voorbeeld';
import { mailBeeld } from '../src/lib/mail';
import { BUSINESS } from '../src/lib/business';

const MAILS = voorbeeldMails();

describe('mailbeelden', () => {
  it('vertaalt een productpad naar het mailbeeld ernaast', () => {
    expect(mailBeeld('/img/products/sokken-front-v2.webp')).toBe('/img/mail/sokken-front-v2.jpg');
    expect(mailBeeld('/img/products/back-cap-front.png')).toBe('/img/mail/back-cap-front.jpg');
  });

  it('geeft niets terug voor een pad buiten de productmap', () => {
    // Liever geen foto dan een kapot icoontje bij iemand die net betaald heeft.
    expect(mailBeeld('/img/heritage/arjo-the-rat.webp')).toBeNull();
    expect(mailBeeld('https://elders.nl/foto.jpg')).toBeNull();
    expect(mailBeeld(undefined)).toBeNull();
    expect(mailBeeld(null)).toBeNull();
  });
});

describe.each(MAILS.map((m) => [m.slug, m] as const))('mail: %s', (_slug, mail) => {
  it('gebruikt geen WebP', () => {
    // Outlook toont WebP helemaal niet. De site draait er wel volledig op,
    // dus dit is de makkelijkste fout om per ongeluk te maken.
    expect(mail.html).not.toMatch(/\.webp/i);
  });

  it('verwijst beelden absoluut', () => {
    const srcs = [...mail.html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
    for (const src of srcs) {
      expect(src, `beeld-URL moet absoluut zijn: ${src}`).toMatch(/^https?:\/\//);
    }
  });

  it('zet elke gekleurde cel ook op het bgcolor-attribuut', () => {
    // Word negeert `background-color` uit CSS en honoreert `bgcolor`. Staat
    // alleen de CSS-variant er, dan valt de kleur weg en houd je donkere tekst
    // op de standaard witte achtergrond over. Precies wat er bij de knop
    // "Volg je bestelling" gebeurde.
    const cellen = [...mail.html.matchAll(/<t[dh]([^>]*)>/gi)].map((m) => m[1]);
    for (const attrs of cellen) {
      if (!/style="[^"]*background-color\s*:/i.test(attrs)) continue;
      expect(attrs, `cel met achtergrond mist bgcolor: ${attrs.trim().slice(0, 80)}`)
        .toMatch(/bgcolor="#[0-9A-Fa-f]{6}"/);
    }
  });

  it('heeft geen style-blok en geen moderne layout', () => {
    // Gmail strippen een <style>-blok in doorgestuurde mail; dan valt alle
    // opmaak weg. Flex en grid kent de Word-engine niet.
    expect(mail.html).not.toMatch(/<style[\s>]/i);
    expect(mail.html).not.toMatch(/display\s*:\s*(flex|grid)/i);
  });

  it('draagt een preheader', () => {
    // Zonder preheader pakt Gmail de eerste tekst uit de body, en dat is het
    // woordmerk. In de inbox staat er dan "Villa Happ Villa Happ".
    expect(mail.html).toMatch(/max-height:0;max-width:0/);
  });

  it('heeft een onderwerp zonder regeleinde', () => {
    expect(mail.subject.length).toBeGreaterThan(8);
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

describe('orderbevestiging: wettelijke inhoud', () => {
  const bevestiging = MAILS.find((m) => m.slug === 'orderbevestiging')!;

  it('draagt het herroepingsrecht voluit', () => {
    // Art. 6:230m BW vraagt deze informatie op een duurzame gegevensdrager.
    // Een link naar een pagina die morgen kan wijzigen is dat niet, dus de
    // tekst moet in de mail zelf staan.
    expect(bevestiging.html).toContain(`${BUSINESS.returnDays} dagen`);
    expect(bevestiging.html).toMatch(/verwerkingskosten/i);
    expect(bevestiging.html).toMatch(/retourzending/i);
    expect(bevestiging.html).toMatch(/herroeping/i);
  });

  it('noemt het retouradres en de registraties', () => {
    expect(bevestiging.html).toContain(BUSINESS.returnAddress.street);
    expect(bevestiging.html).toContain(BUSINESS.kvk);
  });

  it('heeft een leesbare knop: lichte tekst op de donkere cel', () => {
    // De concrete fout uit VH-2026-00001, als test. De cel draagt de inkt-
    // kleur als attribuut, de link daarbinnen de papierkleur.
    const cel = /<td bgcolor="#1C1813"[^>]*>\s*<a[^>]+style="[^"]*color:#F4EEE3/i;
    expect(bevestiging.html, 'de knop staat niet als lichte tekst op een donkere cel').toMatch(cel);
  });

  it('toont elke besteldregel met aantal en bedrag', () => {
    expect(bevestiging.html).toContain('Stap voor Stap sokken');
    expect(bevestiging.html).toContain('Organic Cotton Hoodie');
    expect(bevestiging.html).toContain('/img/mail/sokken-front-v2.jpg');
  });
});
