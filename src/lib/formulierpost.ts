/**
 * Villa Happ — publieke POST-routes accepteren alleen een formulier
 *
 * WAAROM DIT BESTAAT
 * ------------------
 * Astro weigert formuliergecodeerde en multipart-verzoeken van een andere site.
 * Op een JSON-verzoek geldt die controle niet. Tussen 3 en 9 september 2026
 * kwam een bot daar drie keer achter elkaar doorheen:
 *
 *   3 t/m 7 sep   /api/newsletter        64 aanmeldingen, 60 mails, 1 spamklacht
 *   7 t/m 8 sep   /api/herinnering        8 inzendingen, 16 mails
 *   7 t/m 8 sep   /api/atelier/claim     51 nummers uit een oplage van 500
 *
 * Elke keer sloot ik één deur en verhuisde hij naar de volgende. Op 8 september
 * sloot ik /api/herinnering en /api/atelier/claim, en niet /api/newsletter, en
 * dat is precies de route die de bevestigingsmail verstuurt. De volgende
 * ochtend stonden er vier nieuwe rijen.
 *
 * Deze functie staat er zodat de controle één plek heeft. Komt er een nieuwe
 * publieke POST-route bij, gebruik hem dan meteen; `tests/formulierpost.test.ts`
 * telt de routes en valt om zodra er een zonder deze controle bij komt.
 *
 * WAT DIT NIET DEKT
 * -----------------
 * Routes die van buitenaf aangeroepen moeten worden. De Mollie-webhook en de
 * uitschrijfknop van Gmail sturen hun eigen vorm en horen hier niet langs.
 * Die staan bij name genoemd in de test.
 */

/** Is dit een verzoek dat uit een echt formulier kan komen? */
export function isFormulierPost(request: Request): boolean {
  const type = request.headers.get('content-type') || '';
  return type.includes('multipart/form-data')
    || type.includes('application/x-www-form-urlencoded');
}

/**
 * Strenger: alleen multipart. Voor routes waar een bestand meekomt, want een
 * formulier met een bestand kán niet urlencoded zijn. Wie daar urlencoded
 * stuurt, gebruikt het formulier niet.
 */
export function isMultipartPost(request: Request): boolean {
  return (request.headers.get('content-type') || '').includes('multipart/form-data');
}

/**
 * De velden als platte tekst. Een leeg veld telt als afwezig, want een
 * niet-ingevuld tekstveld komt als lege tekenreeks binnen en `undefined` laat
 * de standaardwaarde in het schema zijn werk doen.
 */
export async function formulierVelden(request: Request): Promise<Record<string, string | undefined>> {
  const fd = await request.formData();
  const uit: Record<string, string | undefined> = {};
  for (const [sleutel, waarde] of fd.entries()) {
    if (typeof waarde === 'string') uit[sleutel] = waarde.length > 0 ? waarde : undefined;
  }
  return uit;
}

/**
 * Het antwoord op een verzoek dat geen formulier is.
 *
 * 415 en niet 400: er is niets mis met de invoer, het formaat wordt niet
 * geaccepteerd. De melding wijst een mens naar de plek waar het wel werkt.
 */
export function geenFormulier(route: string, contentType: string, veld = 'message'): Response {
  console.warn(`[${route}] Verzoek zonder formulier geweigerd:`, contentType.slice(0, 40));
  return new Response(JSON.stringify({
    success: false,
    [veld]: 'Gebruik het formulier op de site.',
  }), { status: 415, headers: { 'Content-Type': 'application/json' } });
}
