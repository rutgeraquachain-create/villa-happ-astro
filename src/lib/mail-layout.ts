/**
 * Villa Happ — gedeelde opmaak voor transactiemail (server-only)
 *
 * Eén omhulsel voor alle mails, zodat de bevestiging, de verzendmelding, de
 * voorraadmelding en de winkeliersmelding niet uit elkaar groeien.
 *
 * WAAROM DIT ZO GESCHREVEN IS
 * ---------------------------
 * Outlook op Windows rendert e-mail met de Word-engine, niet met een browser.
 * Dat is geen detail: het is de client waarin de eigenaar zijn eigen
 * bestellingen leest. Gemeten op 25 augustus 2026 op de eerste echte
 * bestelling (VH-2026-00001) stond de knop "Volg je bestelling" daar als
 * donkere tekst op donker, want Word gooit een CSS-achtergrond op een `<a>`
 * weg en laat de tekstkleur staan.
 *
 * Daarom gelden hier vier regels:
 *
 *  1. Layout met tabellen, niet met `div` en `flex`. Word kent geen van beide.
 *  2. Achtergronden met het `bgcolor`-attribuut, niet alleen met CSS.
 *  3. Beeld als PNG of JPG uit `public/img/mail/`. De site draait op WebP en
 *     dat toont Outlook helemaal niet. Genereren doet `scripts/mail-assets.mjs`.
 *  4. Geen webfonts. Fraunces laadt niet in een mailclient; een serif-stack
 *     die overal bestaat leest rustiger dan een halve merkhuisstijl.
 *
 * Er staat bewust geen `<style>`-blok in: Gmail strippen dat in de
 * doorgestuurde variant, en dan valt de hele opmaak weg. Alles staat inline.
 */

/** Merkkleuren, gelijk aan `--vh-*` in src/styles/tokens.css. */
export const KLEUR = {
  ink: '#1C1813',
  paper: '#F4EEE3',
  accent: '#FE6B01',
  /** Achtergrond buiten de kaart: iets dieper dan het papier. */
  achtergrond: '#E7DFD1',
  /** Lijnen en scheidingen. */
  lijn: '#DCD2C0',
  /** Bijschrift en kleine letter. */
  zacht: '#7A705F',
} as const;

/** Serif-stack die op Windows, macOS en Android bestaat. */
const SERIF = "Georgia, 'Times New Roman', Times, serif";
/** Voor bedragen en codes, waar uitlijning telt. */
export const MONO = "'Courier New', Courier, monospace";

export const LETTERTYPE = SERIF;

/**
 * Knop die ook in Outlook leesbaar is.
 *
 * De truc is de achtergrond op de `<td>` te zetten met het `bgcolor`-attribuut.
 * Word honoreert dat wel, terwijl het `background` op een `<a>` negeert. De
 * link zelf krijgt `display:block` zodat de hele cel klikbaar blijft.
 */
export function knop(href: string, tekst: string, kleur: string = KLEUR.ink): string {
  const tekstkleur = kleur === KLEUR.ink ? KLEUR.paper : KLEUR.ink;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td bgcolor="${kleur}" style="background-color:${kleur};padding:14px 30px;">
        <a href="${href}" style="display:block;color:${tekstkleur};font-family:${SERIF};font-size:15px;letter-spacing:0.04em;text-decoration:none;">${tekst}</a>
      </td>
    </tr>
  </table>`;
}

/** Dunne scheidingslijn over de volle breedte van de kaart. */
export function lijn(marge = '26px'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:${marge} 0;">
    <tr><td height="1" bgcolor="${KLEUR.lijn}" style="height:1px;line-height:1px;font-size:0;">&nbsp;</td></tr>
  </table>`;
}

interface ShellOpties {
  /**
   * De regel die de mailclient naast het onderwerp toont, vóór de mail geopend
   * is. Zonder deze regel pakt Gmail de eerste tekst uit de body, en dat is
   * hier het woordmerk. Dan staat er in de inbox "Villa Happ Villa Happ".
   */
  preheader: string;
  /** De inhoud van de kaart, als HTML met inline stijlen. */
  inhoud: string;
  /** Kleine letter onderaan, buiten de kaart. */
  voet: string;
  origin: string;
}

/**
 * Het volledige mailbericht. Buitenste tabel vult de client, binnenste kaart
 * is 600 px breed. Die breedte is de veilige bovengrens: het leespaneel van
 * Outlook is bij veel mensen smaller dan een browservenster.
 */
export function shell({ preheader, inhoud, voet, origin }: ShellOpties): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="nl">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Villa Happ</title>
</head>
<body style="margin:0;padding:0;background-color:${KLEUR.achtergrond};">
<!-- Preheader: zichtbaar in het inboxoverzicht, niet in de mail zelf. -->
<div style="display:none;font-size:1px;color:${KLEUR.achtergrond};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${KLEUR.achtergrond}" style="background-color:${KLEUR.achtergrond};margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 12px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;border-collapse:collapse;">

        <!-- Kop: merkteken en woordmerk -->
        <tr>
          <td align="center" style="padding:0 0 22px;">
            <img src="${origin}/img/mail/logo.png" width="52" height="52" alt="Villa Happ"
                 style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto 12px;" />
            <div style="font-family:${SERIF};font-size:15px;letter-spacing:0.34em;text-transform:uppercase;color:${KLEUR.ink};">Villa&nbsp;Happ</div>
          </td>
        </tr>

        <!-- De kaart -->
        <tr>
          <td bgcolor="${KLEUR.paper}" style="background-color:${KLEUR.paper};padding:36px 34px;">
            ${inhoud}
          </td>
        </tr>

        <!-- Voet, buiten de kaart -->
        <tr>
          <td style="padding:22px 8px 0;font-family:${SERIF};font-size:12px;line-height:1.7;color:${KLEUR.zacht};">
            ${voet}
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Kop binnen de kaart: een klein label boven een serif-titel. */
export function titel(label: string, kop: string): string {
  return `<div style="font-family:${MONO};font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${KLEUR.zacht};margin:0 0 10px;">${label}</div>
<h1 style="margin:0 0 18px;font-family:${SERIF};font-size:27px;line-height:1.25;font-weight:normal;color:${KLEUR.ink};">${kop}</h1>`;
}

/** Gewone alinea binnen de kaart. */
export function alinea(tekst: string, marge = '0 0 22px'): string {
  return `<p style="margin:${marge};font-family:${SERIF};font-size:15px;line-height:1.65;color:${KLEUR.ink};">${tekst}</p>`;
}
