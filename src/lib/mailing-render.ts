/**
 * Villa Happ — een mailing uit de contentcollectie naar verzendklare HTML
 *
 * Staat los van `mailing.ts` (die verstuurt) en van `mail-layout.ts` (die de
 * opmaak levert). Hier gebeurt alleen de vertaling van geschreven tekst naar
 * de tabelopmaak die Outlook aankan.
 *
 * Bewust een kleine eigen markdown-omzetting en geen bibliotheek. Wat een
 * mailing nodig heeft is een alinea, een tussenkop, vet, cursief en een link.
 * Alles daarbuiten (tabellen, afbeeldingen, lijsten met eigen opmaak) vraagt
 * per element weer een Outlook-beslissing, en dan is inline HTML in de
 * markdown eerlijker dan een omzetter die stilletijd iets anders doet dan je
 * verwacht.
 */

import { KLEUR, MONO, shell, knop, lijn, titel, alinea } from './mail-layout';
import { BUSINESS } from './business';

/** Ontsnapt HTML in de brontekst, zodat een losse < niets breekt. */
function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Zet inline markdown om: **vet**, *cursief* en [tekst](url).
 * Draait ná het escapen, dus de gegenereerde tags blijven staan.
 */
function inline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, tekst, url) =>
      `<a href="${url}" style="color:${KLEUR.ink};text-decoration:underline;">${tekst}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
}

/**
 * Splitst één alinea in de stukken die door een `<br />` gescheiden moeten
 * worden. Meestal is dat er precies één.
 *
 * Standaard markdown: een enkel regeleinde binnen een alinea is een spatie. De
 * lezer bepaalt dan zelf waar de tekst afbreekt, op de breedte van zijn eigen
 * scherm.
 *
 * Hier werd eerst élk regeleinde een `<br />`, met als reden dat een adres of
 * een opsomming dan leesbaar bleef. Dat gaf de brontekst de macht over de
 * opmaak. Gemeten 2 september 2026 op de eerste mailing: de markdown in
 * `src/content/mailings/` is op ongeveer tachtig tekens afgebroken, en die
 * afbreking kwam ongewijzigd in de mail terecht. Het woord "Wat" stond daardoor
 * alleen op een regel. Op een telefoon breekt elke bronregel bovendien nog een
 * keer, en dan valt de alinea helemaal uiteen.
 *
 * Een echte afbreking vraag je aan zoals markdown dat kent: twee spaties aan
 * het eind van de regel, of een backslash. Een adresblok kan dus nog steeds,
 * maar het staat er dan omdat iemand het bedoelde.
 */
function regelsSamen(blok: string): string[] {
  const stukken: string[] = [];
  let lopend = '';
  for (const regel of blok.split('\n')) {
    const hard = /(\s{2,}|\\)$/.test(regel);
    const kaal = regel.replace(/(\s+|\\)+$/, '').trim();
    lopend = lopend ? `${lopend} ${kaal}` : kaal;
    if (hard) {
      stukken.push(lopend);
      lopend = '';
    }
  }
  if (lopend) stukken.push(lopend);
  return stukken.filter(Boolean);
}

/**
 * Markdown-body naar mail-HTML.
 *
 * Alinea's worden gescheiden door een lege regel. Een regel die met ## begint
 * is een tussenkop. Voor regeleinden binnen een alinea, zie `regelsSamen`.
 */
export function bodyNaarHtml(markdown: string): string {
  return markdown
    .trim()
    .split(/\n\s*\n/)
    .map((blok) => {
      const stukken = regelsSamen(blok);
      if (!stukken.length) return '';
      const tekst = stukken.join(' ');

      if (tekst.startsWith('## ')) {
        return `<div style="font-family:${MONO};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${KLEUR.zacht};margin:26px 0 8px;">${inline(escape(tekst.slice(3)))}</div>`;
      }

      return alinea(stukken.map((s) => inline(escape(s))).join('<br />'));
    })
    .filter(Boolean)
    .join('\n');
}

export interface MailingBron {
  slug: string;
  onderwerp: string;
  preheader: string;
  label: string;
  titel: string;
  knopTekst?: string;
  knopUrl?: string;
  body: string;
}

/**
 * De volledige mail.
 *
 * De uitschrijflink staat als `{{afmeldlink}}` in de HTML en wordt pas per
 * ontvanger ingevuld in `zetMailingKlaar`. Zo bestaat er nooit een versie van
 * de mail met andermans token erin.
 *
 * Die link staat er altijd, en niet als optie: een commerciële mailing zonder
 * uitschrijfmogelijkheid mag niet verstuurd worden (art. 11.7 Telecomwet).
 */
export function renderMailing(bron: MailingBron, origin: string): { subject: string; html: string } {
  const inhoud = `
    ${titel(bron.label, bron.titel)}
    ${bodyNaarHtml(bron.body)}
    ${bron.knopUrl && bron.knopTekst ? `${lijn('28px 0 24px')}<div>${knop(bron.knopUrl, bron.knopTekst)}</div>` : ''}`;

  /**
   * Het postadres hoort in een commerciële mailing: het maakt de afzender
   * herleidbaar en het scheelt in spamfilters. Het komt uit business.ts, want
   * een tweede kopie van dat adres is precies wat achterblijft bij een verhuizing.
   */
  const afzender = `${BUSINESS.legalName}, ${BUSINESS.businessAddress.street}, ` +
    `${BUSINESS.businessAddress.postalCode} ${BUSINESS.businessAddress.city}`;

  const domein = origin.replace(/^https?:\/\//, '');

  const voet = `Je krijgt deze mail omdat je je hebt aangemeld op ${domein}
    en je aanmelding hebt bevestigd.<br />
    <a href="{{afmeldlink}}" style="color:${KLEUR.zacht};text-decoration:underline;">Uitschrijven</a>
    &middot; ${afzender}`;

  const html = shell({ preheader: bron.preheader, inhoud, voet, origin });
  return { subject: bron.onderwerp, html };
}
