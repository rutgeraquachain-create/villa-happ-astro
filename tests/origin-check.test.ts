/**
 * De Mollie-webhook werd door Astro's ingebouwde CSRF-controle geweigerd met
 * een 403. Gevolg: een klant betaalde, Mollie meldde dat, en de bestelling
 * bleef op 'in afwachting' staan. Geen bevestigingsmail, voorraad bleef
 * gereserveerd, en niets in de winkel dat liet zien dat er iets misging.
 *
 * Deze tests leggen zowel de vrijstelling als de bescherming eromheen vast.
 */

import { describe, it, expect } from 'vitest';
import { magDoor, VRIJGESTELDE_PADEN } from '../src/lib/origin-check';

const HOST = 'villa-happ.nl';
const form = 'application/x-www-form-urlencoded';

/** Zoals Mollie hem stuurt: form-encoded, vanaf hun servers, geen Origin. */
const mollieWebhook = {
  methode: 'POST',
  pad: '/api/checkout/webhook',
  origin: null,
  host: HOST,
  contentType: form,
};

describe('herkomstcontrole', () => {
  it('laat de Mollie-webhook door zonder Origin', () => {
    expect(magDoor(mollieWebhook)).toBe(true);
  });

  it('weigert dezelfde verzending op een niet-vrijgesteld pad', () => {
    expect(magDoor({ ...mollieWebhook, pad: '/api/beheer/logout' })).toBe(false);
  });

  it('laat de uitschrijfknop van Gmail en Outlook door', () => {
    // RFC 8058: op basis van de List-Unsubscribe-header sturen die clients een
    // form-encoded POST vanaf hun eigen servers, zonder Origin. Zonder deze
    // vrijstelling krijgt precies die knop een 403 en houdt de ontvanger de
    // spamknop over als enige uitweg. Het ondertekende token in het verzoek is
    // hier de bevoegdheid; er is geen sessie die misbruikt kan worden.
    expect(magDoor({ ...mollieWebhook, pad: '/api/newsletter/afmelden' })).toBe(true);
  });


  it('weigert een formulier van een vreemde site', () => {
    expect(magDoor({
      methode: 'POST', pad: '/api/beheer/logout',
      origin: 'https://kwaadaardig.example', host: HOST, contentType: form,
    })).toBe(false);
  });

  it('laat een formulier van de eigen site door', () => {
    expect(magDoor({
      methode: 'POST', pad: '/api/beheer/logout',
      origin: `https://${HOST}`, host: HOST, contentType: form,
    })).toBe(true);
  });

  it('trapt niet in een host die alleen maar zo begint', () => {
    expect(magDoor({
      methode: 'POST', pad: '/api/beheer/logout',
      origin: `https://${HOST}.kwaadaardig.example`, host: HOST, contentType: form,
    })).toBe(false);
  });

  it('weigert een onleesbare Origin', () => {
    expect(magDoor({
      methode: 'POST', pad: '/api/beheer/logout',
      origin: 'geen-url', host: HOST, contentType: form,
    })).toBe(false);
  });

  it('laat JSON met rust — dat kan een formulier niet versturen', () => {
    expect(magDoor({
      methode: 'POST', pad: '/api/checkout/create',
      origin: null, host: HOST, contentType: 'application/json',
    })).toBe(true);
  });

  it('kijkt niet naar de parameters achter het content-type', () => {
    expect(magDoor({
      methode: 'POST', pad: '/api/beheer/logout',
      origin: 'https://kwaadaardig.example', host: HOST,
      contentType: 'multipart/form-data; boundary=----abc',
    })).toBe(false);
  });

  it('laat GET altijd door', () => {
    expect(magDoor({
      methode: 'GET', pad: '/api/beheer/export',
      origin: 'https://kwaadaardig.example', host: HOST, contentType: null,
    })).toBe(true);
  });

  it('stelt niet per ongeluk meer paden vrij dan bedoeld', () => {
    // Groeit deze lijst, dan moet daar een bewuste afweging onder liggen:
    // een vrijgesteld pad mag de inhoud van het verzoek niet vertrouwen.
    // De afweging per pad staat uitgeschreven in src/lib/origin-check.ts.
    expect([...VRIJGESTELDE_PADEN]).toEqual([
      '/api/checkout/webhook',
      '/api/newsletter/afmelden',
    ]);
  });
});
