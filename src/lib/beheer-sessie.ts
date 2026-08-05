/**
 * Villa Happ — beheersessie (server-only)
 *
 * Eén beheerder, dus geen gebruikerstabel: het wachtwoord staat als scrypt-
 * hash in een omgevingsvariabele en de sessie is een ondertekend cookie.
 * Dat scheelt een tabel, een uitnodigingsflow en een wachtwoord-resetketen
 * die nu niemand nodig heeft.
 *
 * Patroon uit prWize Core:
 *  - de sessie tekent met een EIGEN afgeleide sleutel, gescheiden van de
 *    order-tokens. Een klanttoken kan de beheersessie nooit passeren.
 *  - timing-safe vergelijken, en een vervalst cookie geeft een nette
 *    weigering, nooit een 500.
 *
 * Bewust NIET gebouwd: 2FA. Dat staat als hardeningpunt op de
 * opleverchecklist, niet als bestaande claim.
 */

import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto';

export const BEHEER_COOKIE = 'vh_beheer';
const GELDIG_MS = 12 * 60 * 60 * 1000; // een werkdag

function secret(): string {
  const s = import.meta.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error('[Villa Happ] AUTH_SECRET ontbreekt of is korter dan 32 tekens.');
  }
  return s;
}

function subSleutel(): Buffer {
  return createHmac('sha256', secret()).update('villahapp-sessie:beheer').digest();
}

function teken(payload: string): string {
  return createHmac('sha256', subSleutel()).update(payload).digest('hex');
}

/* ---------- Wachtwoord ---------- */

/**
 * Formaat: `scrypt:<salt-hex>:<hash-hex>`.
 *
 * Scheidingsteken is bewust een dubbele punt en niet de `$` die je bij
 * scrypt- en bcrypt-hashes gewend bent. Een `$` in een .env-waarde wordt
 * door dotenv als variabele gelezen: `scrypt$a1b2...$c3d4...` kwam bij de
 * applicatie aan als `scrypt$c3d4...`, met de salt eruit gegeten. Het
 * juiste wachtwoord gaf daardoor een 401, zonder enige foutmelding.
 * Hex en `scrypt` bevatten nooit een dubbele punt, dus die is eenduidig.
 *
 * Genereer een hash met: `npm run beheer:hash -- '<wachtwoord>'`
 */
/** Vaste maten. Zie de lengtecontrole in `controleerWachtwoord` hieronder. */
export const SALT_BYTES = 16;
export const HASH_BYTES = 32;

export function hashWachtwoord(wachtwoord: string, salt?: Buffer): string {
  const s = salt ?? randomBytes(SALT_BYTES);
  const h = scryptSync(wachtwoord, s, HASH_BYTES);
  return `scrypt:${s.toString('hex')}:${h.toString('hex')}`;
}

/**
 * Timing-safe controle. False bij elke vorm van onzin, nooit een exception.
 *
 * De lengtes worden hard afgedwongen, en dat is geen formaliteit. Eerder
 * werd de sleutel afgeleid op `verwacht.length`, dus op de lengte van wat er
 * toevallig was opgeslagen. Werd die hash ergens afgekapt, bijvoorbeeld bij
 * het plakken in een omgevingsvariabele, dan vergeleek deze functie nog maar
 * een deel van de bytes en gaf hij alsnog `true`. Bij een hash die tot vier
 * bytes was ingekort, hoefde een aanvaller nog maar 32 bits te raden.
 *
 * Een afgekapte waarde hoort te falen, niet stilletijds de deur open te
 * zetten. Beter een winkelier die niet naar binnen kan en het meldt.
 */
export function controleerWachtwoord(wachtwoord: string, opgeslagen: string): boolean {
  try {
    const delen = opgeslagen.split(':');
    if (delen.length !== 3 || delen[0] !== 'scrypt') return false;
    if (delen[1].length !== SALT_BYTES * 2 || delen[2].length !== HASH_BYTES * 2) return false;
    const salt = Buffer.from(delen[1], 'hex');
    const verwacht = Buffer.from(delen[2], 'hex');
    // Buffer.from kapt stilzwijgend af bij ongeldige hex; controleer dus wat
    // er werkelijk uit kwam en niet alleen wat erin ging.
    if (salt.length !== SALT_BYTES || verwacht.length !== HASH_BYTES) return false;
    const gegeven = scryptSync(wachtwoord, salt, HASH_BYTES);
    return timingSafeEqual(gegeven, verwacht);
  } catch {
    return false;
  }
}

/** Is er een beheerwachtwoord geconfigureerd? Zonder dit blijft /beheer dicht. */
export function beheerGeconfigureerd(): boolean {
  const h = import.meta.env.ADMIN_PASSWORD_HASH;
  return typeof h === 'string' && h.startsWith('scrypt:');
}

export function controleerBeheerWachtwoord(wachtwoord: string): boolean {
  const h = import.meta.env.ADMIN_PASSWORD_HASH;
  if (!h) return false;
  return controleerWachtwoord(wachtwoord, h);
}

/* ---------- Sessiecookie ---------- */

export function maakBeheerSessie(nu: number = Date.now()): string {
  const payload = `beheer:${nu + GELDIG_MS}`;
  return `${payload}.${teken(payload)}`;
}

export function leesBeheerSessie(cookie: string | undefined, nu: number = Date.now()): boolean {
  if (!cookie) return false;
  const punt = cookie.lastIndexOf('.');
  if (punt < 0) return false;
  const payload = cookie.slice(0, punt);
  const gegeven = cookie.slice(punt + 1);
  const verwacht = teken(payload);
  if (gegeven.length !== verwacht.length || !/^[0-9a-f]+$/i.test(gegeven)) return false;
  const bgeg = Buffer.from(gegeven, 'hex');
  const bver = Buffer.from(verwacht, 'hex');
  if (bgeg.length !== bver.length || !timingSafeEqual(bgeg, bver)) return false;

  const delen = payload.split(':');
  if (delen.length !== 2 || delen[0] !== 'beheer') return false;
  const verval = Number(delen[1]);
  return Number.isFinite(verval) && nu <= verval;
}

/**
 * Mag deze bezoeker een beheerpagina zien?
 *
 * Bewust méér dan alleen een geldig cookie. Haal je ADMIN_PASSWORD_HASH weg
 * om het portaal dicht te zetten, dan hoort dat meteen te gelden. Zonder deze
 * extra eis bleef een sessie die al liep nog tot twaalf uur lang bestellingen
 * en voorraad tonen, terwijl de API-routes wél al dichtgingen. Dat verschil
 * tussen lezen en schrijven is precies wat je niet wilt uitleggen.
 */
export function beheerToegang(cookie: string | undefined, nu: number = Date.now()): boolean {
  return beheerGeconfigureerd() && leesBeheerSessie(cookie, nu);
}

export const COOKIE_OPTIES = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: import.meta.env.PROD,
  maxAge: GELDIG_MS / 1000,
};

/* ---------- CSRF ---------- */

/**
 * Muterende beheeracties eisen een token dat aan de sessie hangt. Een
 * SameSite=Lax-cookie dekt de meeste gevallen af, maar niet een POST vanaf
 * een pagina die de beheerder zelf opent.
 */
export function maakCsrfToken(sessieCookie: string): string {
  return createHmac('sha256', subSleutel()).update(`csrf:${sessieCookie}`).digest('hex');
}

export function controleerCsrf(sessieCookie: string | undefined, gegeven: string | undefined): boolean {
  if (!sessieCookie || !gegeven) return false;
  const verwacht = maakCsrfToken(sessieCookie);
  if (gegeven.length !== verwacht.length || !/^[0-9a-f]+$/i.test(gegeven)) return false;
  return timingSafeEqual(Buffer.from(gegeven, 'hex'), Buffer.from(verwacht, 'hex'));
}
