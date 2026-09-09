/**
 * Villa Happ — de hero vangt geen kliks meer zodra hij is weggescrold.
 *
 * WAAROM DIT NIET IN DE TWEEN ZELF MAG
 * -----------------------------------
 * In `motion.ts` stond `pointerEvents: 'none'` als eigenschap in de scrub-tween,
 * zowel op `.vh-hero-inner` (desktop) als op `.vh-hero-bottom` (mobiel). Dat
 * werkt niet zoals het eruitziet: `pointer-events` is geen waarde die je kunt
 * interpoleren, dus GSAP schrijft hem meteen bij de start van de tween in plaats
 * van aan het eind.
 *
 * Gemeten 9 september 2026 op villahapp.nl bij 1440 bij 900: `.vh-hero-inner`
 * had `opacity: 1` en `pointer-events: none` als inline stijl, terwijl geen
 * enkele CSS-regel op die eigenschap matchte. Omdat `pointer-events` erft, waren
 * "Shop de collectie" en "Bekijk drops" allebei onklikbaar. De hoofd-CTA van de
 * homepage deed niets, en dat is niet te zien: de knoppen staan er gewoon.
 *
 * WAAROM DIT EEN EIGEN BESTAND IS
 * `motion.ts` leest `window` bij het laden van de module, dus dat bestand is
 * niet te importeren in een toets. Deze functie is puur en daardoor wel.
 *
 * De drempel staat op 0,2 omdat de tween die de inhoud wegfadet op 0,22 klaar
 * is. Vanaf daar is er niets meer te zien en hoort er ook niets meer te vangen.
 */

/** Zet of verwijdert de klasse die de hero onklikbaar maakt. */
export function zetHeroKlikbaar(hero: Element, voortgang: number): void {
  hero.classList.toggle('is-weggescrold', voortgang > 0.2);
}
