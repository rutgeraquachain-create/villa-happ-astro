/**
 * Villa Happ — de uitkomst van een geplande taak die uit losse stappen bestaat
 *
 * Een cronroute die drie dingen doet, moet de andere twee afmaken als er één
 * mislukt: hapert het versturen van mail, dan hoort de voorraad nog steeds vrij
 * te komen. Dat is een goede keuze. De prijs ervan is dat de route een mislukte
 * stap afvangt, en dan is de verleiding om aan het eind gewoon 200 te geven.
 *
 * GEMETEN 14 SEPTEMBER 2026. `/api/notify/run` gaf 146 keer 200 in 36 uur,
 * precies het verwachte aantal runs, en daarmee leek de taak bewezen. Gegroepeerd
 * op logniveau stonden er in dezelfde periode zeven foutregels: Gateway Timeouts
 * van Supabase op het vrijgeven van voorraad en op het meten van de wachtrij.
 * De statuscode zei dat de route tot het einde kwam, niet dat elke stap slaagde.
 * Les 0166 in het lessendagboek.
 *
 * Deze functie maakt van de losse stappen één status: 200 als alles slaagde,
 * 500 als er één mislukte. Vercel start een mislukte cronrun niet opnieuw
 * ("Vercel will not retry an invocation if a cron job fails", docs cron-jobs,
 * gelezen 14 september 2026), dus een 500 levert geen extra run op. Hij levert
 * wel een zichtbare fout op, en dat is het doel.
 */

export interface StapUitslag {
  ok: boolean;
  /** Wat er misging, of waarom de stap bewust is overgeslagen. */
  melding?: string;
}

export type Stappen = Record<string, StapUitslag>;

export function cronUitslag(stappen: Stappen): { status: 200 | 500; mislukt: string[] } {
  const namen = Object.keys(stappen);
  /**
   * Geen stappen is geen geslaagde run maar een run die niets heeft gecontroleerd.
   * Een lege lijst die groen meldt, is precies het soort stilte waar dit bestand
   * tegen bestaat.
   */
  if (namen.length === 0) return { status: 500, mislukt: ['geen-stappen'] };

  const mislukt = namen.filter((naam) => !stappen[naam].ok);
  return { status: mislukt.length ? 500 : 200, mislukt };
}
