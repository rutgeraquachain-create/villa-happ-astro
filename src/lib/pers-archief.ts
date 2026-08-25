/**
 * Villa Happ in de vakpers, 2004 tot 2010.
 *
 * De enige bron voor persvermeldingen. Voedt de persmuur in hoofdstuk 06 van
 * beide tijdlijnen én het archief op /pers, zodat die twee niet uit de pas
 * kunnen lopen.
 *
 * WAAROM DIT GEEN SCREENSHOTS ZIJN
 * Er lagen schermafdrukken van deze artikelen klaar. Die zijn niet gebruikt:
 * het zijn beschermde werken van andermans redactie, inclusief opmaak, logo's
 * en bij één krant een persfoto met een genoemde fotograaf achter een
 * betaalmuur. Het citaatrecht (artikel 15a Auteurswet) staat toe dat je
 * cíteert met bronvermelding, niet dat je een hele artikelpagina als plaatje
 * overneemt. Vandaar kop, bron en datum in onze eigen typografie.
 *
 * WAAROM ELKE URL IS NAGELOPEN
 * Alle links hieronder gaven een 200 zonder omleiding op 25 augustus 2026.
 * Twee stukken die Rutger aanleverde staan er bewust NIET in: een bericht van
 * RTV Utrecht van 7 december 2005 over één winkel in het Amersfoortse
 * Drakennest, en "Villa Happ opent nieuwe winkels" van 11 december 2006. Van
 * beide kon ik de bron-URL niet terugvinden, en bij die tweede is zelfs de
 * uitgever niet hard te maken. Een perspagina met een dode of gegokte link is
 * slechter dan een kortere lijst.
 *
 * Voegt iemand hier een regel toe: controleer eerst of de URL leeft, en neem
 * de kop letterlijk over zoals de redactie hem publiceerde.
 */

export interface Persvermelding {
  /** De kop zoals gepubliceerd. Niet herschrijven, dit is een citaat. */
  kop: string;
  bron: string;
  /** ISO, voor sortering en het datePublished in schema. */
  datum: string;
  /** Nederlandse weergave voor op de pagina. */
  datumTekst: string;
  url: string;
  /**
   * Op de persmuur in hoofdstuk 06. Vijf stuks die samen de boog vertellen:
   * overname, val, comeback, val, einde. Meer past niet in het mediakader
   * zonder dat de koppen onleesbaar klein worden.
   */
  muur?: true;
}

export const PERS: Persvermelding[] = [
  {
    kop: 'Overname Villa Happ door EDCC',
    bron: 'FashionUnited',
    datum: '2004-07-14',
    datumTekst: '14 juli 2004',
    url: 'https://fashionunited.nl/nieuws/mode/overname-villa-happ-door-edcc/2004071437283',
    muur: true,
  },
  {
    kop: 'Eigen winkels Villa Happ failliet',
    bron: 'FashionUnited',
    datum: '2005-11-29',
    datumTekst: '29 november 2005',
    url: 'https://fashionunited.nl/nieuws/mode/eigen-winkels-villa-happ-failliet/2005112935511',
    muur: true,
  },
  {
    kop: 'Kledingketen Villa Happ maakt doorstart',
    bron: 'RTV Noord',
    datum: '2005-12-09',
    datumTekst: '9 december 2005',
    url: 'https://www.rtvnoord.nl/nieuws/53494/kledingketen-villa-happ-maakt-doorstart',
  },
  {
    kop: 'Villa Happ expandeert',
    bron: 'FashionUnited',
    datum: '2007-03-03',
    datumTekst: '3 maart 2007',
    url: 'https://fashionunited.nl/nieuws/mode/villa-happ-expandeert/2007030134074',
  },
  {
    // De vindplaats van de bijnaam die op /story staat. Zonder deze regel is
    // "de vakpers geeft het merk een bijnaam" een claim zonder bron.
    kop: 'Villa Happ - The Comeback Kid',
    bron: 'FashionUnited',
    datum: '2007-06-01',
    datumTekst: '1 juni 2007',
    url: 'https://fashionunited.nl/nieuws/mode/villa-happ-the-comeback-kid/2007060133818',
    muur: true,
  },
  {
    kop: 'Villa Happ opent webshop',
    bron: 'FashionUnited',
    datum: '2007-08-10',
    datumTekst: '10 augustus 2007',
    url: 'https://fashionunited.nl/nieuws/mode/villa-happ-opent-webshop/2007081033570',
  },
  {
    kop: 'Oprichter Villa Happ overleden',
    bron: 'FashionUnited',
    datum: '2007-11-20',
    datumTekst: '20 november 2007',
    url: 'https://fashionunited.nl/nieuws/mode/oprichter-villa-happ-overleden/2007112033282',
  },
  {
    kop: 'Uitbreiding Villa Happ op komst',
    bron: 'FashionUnited',
    datum: '2008-02-08',
    datumTekst: '8 februari 2008',
    url: 'https://fashionunited.nl/nieuws/mode/uitbreiding-villa-happ-op-komst/2008020833031',
  },
  {
    kop: 'Nieuwe filialen Villa Happ',
    bron: 'FashionUnited',
    datum: '2008-06-20',
    datumTekst: '20 juni 2008',
    url: 'https://fashionunited.nl/v1/columns/nieuwe-filialen-villa-happ/200806206215',
  },
  {
    kop: 'Lousberg stapt op bij Villa Happ',
    bron: 'FashionUnited',
    datum: '2009-04-02',
    datumTekst: '2 april 2009',
    url: 'https://fashionunited.nl/v1/leads/lousberg-stapt-op-bij-villa-happ/20090402400',
  },
  {
    kop: 'Hester Gerritse verlaat Villa Happ',
    bron: 'FashionUnited',
    datum: '2009-06-12',
    datumTekst: '12 juni 2009',
    url: 'https://fashionunited.nl/v1/columns/hester-gerritse-verlaat-villa-happ/200906127378',
  },
  {
    kop: 'Opnieuw faillissement Villa Happ',
    bron: 'FashionUnited',
    datum: '2010-07-08',
    datumTekst: '8 juli 2010',
    url: 'https://fashionunited.nl/v1/leads/opnieuw-faillissement-villa-happ/201007081057',
  },
  {
    // Tweede uitgever op de muur, zodat het geen bloemlezing van één redactie
    // wordt.
    kop: 'Villa Happ voor derde keer failliet',
    bron: 'RetailTrends',
    datum: '2010-07-09',
    datumTekst: '9 juli 2010',
    url: 'https://retailtrends.nl/news/23528/villa-happ-voor-derde-keer-failliet',
    muur: true,
  },
  {
    kop: 'Doorstart Villa Happ onwaarschijnlijk',
    bron: 'FashionUnited',
    datum: '2010-07-15',
    datumTekst: '15 juli 2010',
    url: 'https://fashionunited.nl/v1/columns/doorstart-villa-happ-onwaarschijnlijk/201007159064',
    muur: true,
  },
];

/** Oplopend op datum, zodat de boog leesbaar is van boven naar beneden. */
export const persOpDatum = (): Persvermelding[] =>
  [...PERS].sort((a, b) => a.datum.localeCompare(b.datum));

/** De vijf koppen voor hoofdstuk 06. */
export const persMuur = (): Persvermelding[] => persOpDatum().filter((p) => p.muur);
