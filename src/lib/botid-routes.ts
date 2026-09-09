/**
 * Villa Happ — welke publieke POST-routes achter BotID staan
 *
 * WAAROM DEZE LIJST OP ÉÉN PLEK STAAT
 * -----------------------------------
 * BotID heeft twee helften. De client hangt aan elk verzoek naar een pad uit
 * deze lijst een kenmerk, en de route controleert dat kenmerk met
 * `checkBotId()`. Staat een pad alleen in de route en niet in deze lijst, dan
 * faalt de controle en krijgt een echte bezoeker een 403. Dat staat met zoveel
 * woorden in de documentatie van Vercel, en het is precies de fout die we deze
 * week twee keer op een andere plek hebben gemaakt: een controle waarvan de
 * andere helft ontbrak.
 *
 * `tests/botid.test.ts` legt de twee helften naast elkaar en valt om zodra er
 * één uit de pas loopt.
 *
 * WAAROM DEZE ZEVEN
 * -----------------
 * Alle publieke POST-routes die vanaf onze eigen pagina's worden aangeroepen.
 * Niet alleen de drie waar de bot doorheen kwam: die aanpak is in september
 * 2026 vier golven lang mislukt, want elke keer verhuisde hij naar de volgende
 * deur. Zie de regel over een aangevallen categorie in `_canon/Feedback-vast`.
 *
 * WAT ER NIET IN STAAT
 * --------------------
 * De webhooks van Mollie en Resend, de uitschrijfknop van Gmail, de cron en de
 * beheerroutes. Die worden niet vanuit onze pagina's aangeroepen, dus er is
 * geen browser die een kenmerk kan meesturen. BotID zou ze allemaal blokkeren.
 *
 * `checkLevel` staat er bewust niet bij. Zonder die optie volgt elke route de
 * projectinstelling in het Vercel-dashboard, en dat is één schakelaar in plaats
 * van veertien plekken die uit de pas kunnen lopen.
 */

export interface BeschermdPad {
  path: string;
  method: 'POST';
}

export const BOTID_PADEN: BeschermdPad[] = [
  { path: '/api/newsletter', method: 'POST' },
  { path: '/api/herinnering', method: 'POST' },
  { path: '/api/atelier/claim', method: 'POST' },
  { path: '/api/contact', method: 'POST' },
  { path: '/api/notify', method: 'POST' },
  { path: '/api/reviews', method: 'POST' },
  { path: '/api/checkout/create', method: 'POST' },
];

/**
 * Het antwoord op een verzoek dat BotID als bot aanmerkt.
 *
 * 403 en geen 415: er is niets mis met het formaat, dit verzoek mag hier
 * gewoon niet komen. De melding blijft vaag met opzet. Een bot die precies
 * hoort waarop hij afketste, past zijn volgende poging aan.
 */
export function geweigerdDoorBotId(route: string, veld = 'message'): Response {
  console.warn(`[${route}] BotID: verzoek geweigerd.`);
  return new Response(JSON.stringify({
    success: false,
    [veld]: 'We konden dit verzoek niet verwerken. Probeer het opnieuw vanaf de site.',
  }), { status: 403, headers: { 'Content-Type': 'application/json' } });
}
