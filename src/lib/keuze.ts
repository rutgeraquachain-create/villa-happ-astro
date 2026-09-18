/**
 * Kiest de klant bij dit product een kleur in plaats van een maat?
 *
 * Dat is zo zodra de varianten onderling in kleur verschillen. Bij de hoodies
 * dragen alle maten dezelfde kleur (elke kleur is een eigen product), dus daar
 * blijft het een maatkeuze. Bij de VANN-fles zijn alle varianten 650 ml en
 * verschillen ze alleen in kleur.
 *
 * Eén plek voor die beslissing, want de catalogus, de productpagina en de
 * voorraadmelding moeten hem hetzelfde nemen. Staat los van catalog.ts zodat
 * de pure meldingslogica de databasecode niet binnenhaalt.
 */
export function kiestOpKleur(variants: { color?: string | null }[]): boolean {
  return new Set(variants.map((v) => v.color).filter(Boolean)).size > 1;
}
