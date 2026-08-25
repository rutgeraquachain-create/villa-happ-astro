# Waar Villa Happ online staat, en wat er niet klopt

Inventarisatie van 21 augustus 2026. Alles hieronder is gevonden via openbaar
zoekwerk op de merknaam, de statutaire naam, het KvK-nummer, het
vestigingsnummer en beide domeinen.

Dit document is een werklijst. Het loopt van bovenstroomse bronnen naar
afgeleide vermeldingen, want dat is de volgorde waarin je ze moet aanpakken.

## De drie problemen in één alinea

Er lopen drie versies van Villa Happ door elkaar op het web. De **oude keten**
die in 2011 omviel, met tachtig winkels en een faillissement dat breed in de
pers kwam. Het **oude domein** `villa-happ.nl` met de ePages-winkel en het
verhaal dat begon in de jaren zestig. En de **huidige onderneming** op
`villahapp.nl`. Zoekmachines en AI-modellen kunnen die drie niet uit elkaar
houden zolang de gegevens elkaar tegenspreken.

## Waar het nu op vastloopt

**Het verhaal in omloop klopt niet meer.** De vakpers en het gearchiveerde
`villa-happ.nl` noemen "Toni Kuijpers" en "de jaren zestig". De site zegt sinds
kort Tony Kuijsters en 10 mei 1945. Dat is niet een detail: het is de kern van
de merkentiteit, en de foute versie staat op meer plekken dan de juiste.

**Er zijn twee LinkedIn-bedrijfspagina's.** `linkedin.com/company/villahapp`
staat als `sameAs` in `entity.ts`. Daarnaast bestaat
`linkedin.com/company/villa-happ`, met de omschrijving "The Kids' Fashion
House" en 51 tot 200 medewerkers. Dat is de pagina van de oude keten. Twee
pagina's voor één merknaam verdelen de signalen precies daar waar Google zijn
entiteitskoppeling vandaan haalt.

**Google's index draagt nog de parkeerpagina van de vorige eigenaar.**
`villahapp.nl/en-us` staat in de zoekresultaten als "villahapp.nl is for sale".
Die URL geeft nu netjes een 404, maar tot Google opnieuw langskomt is dat wat
mensen zien.

## Categorie A: bronnen, hier begin je

Deze bepalen wat de rest overneemt. Verandert hier niets, dan schrijft de
volgende scrape je correcties gewoon terug.

| Bron | Wat er staat | Actie |
|---|---|---|
| KvK Handelsregister | Besoyensestraat 90, 5141 AL Waalwijk. Postadres Postbus 1, 5140 AA. SBI 46421. | Controleer of KvK een website- en e-mailveld heeft en of daar `villahapp.nl` staat |

> **De site wijkt hier bewust van af, sinds 25 augustus 2026.**
> Besoyensestraat 90 is het woonadres van Rutger. Dat hoort niet op een webshop
> en niet in een schema dat elke bedrijvengids overneemt. De site voert daarom
> Vijzelweg 18E als vestigingsadres, het adres waar het werk gebeurt.
>
> Dat betekent dat de site en het register nu uiteenlopen, en met het KvK-nummer
> erbij is dat na te trekken. Juridisch is het te verdedigen: de wet vraagt het
> adres waar de onderneming feitelijk gevestigd is. Zet dit dus **niet** terug
> naar Besoyensestraat om de bronnen te laten matchen. Wordt het register
> bijgewerkt, dan lost het zichzelf op.
| Google Business Profile | **bestaat en is geclaimd**, Knowledge Graph-id `/g/11yfcnmv6h`. Categorie "Kledingwinkel", website `https://www.villahapp.nl/`, telefoon 06 19848002, geen adres (servicegebied NL/BE/LU) | Bedrijfsomschrijving herschrijven, zie hieronder. Categorie en website-URL bijstellen |

### De omschrijving in het bedrijfsprofiel is feitelijk onjuist

De tekst onder "Van Villa Happ" noemt 1960 als startjaar, "Toni Kuijpers" als
oprichtster, en schrijft Babyparadijs aan haar toe. Alle drie kloppen niet meer
met de gecorrigeerde storyline in `entity.ts`: 10 mei 1945, Tony Kuijsters, en
Babyparadijs pas midden jaren vijftig samen met Noud van Happen.

Dit weegt zwaarder dan een gidsvermelding. Het bedrijfsprofiel voedt het
kennispaneel, en daarmee wat Google en AI-modellen als de feiten over dit merk
beschouwen. Zolang hier 1960 en Toni Kuijpers staat, concurreert die versie met
de site zelf, en het profiel wint dat meestal.

Vervangende tekst, binnen de 750 tekens die Google toestaat:

> Villa Happ is een Nederlands heritage lifestylelabel uit Waalwijk. Het
> verhaal begon op 10 mei 1945 in Tilburg, toen Tony Kuijsters en haar man Bas
> Gaillard een winkel openden aan de Heuvelstraat. Samen met Noud van Happen
> werd dat Babyparadijs. In de jaren tachtig was de familie marktleider in de
> productie van kinderkleding onder private label; later volgden tachtig eigen
> winkels door Europa. In 2021 haalde de derde generatie de merkrechten terug
> naar de familie. Sinds 2026 is Villa Happ er weer, voor de dragers van toen,
> nu (jong)volwassen. Zwaar biologisch katoen, in beperkte oplage. De caps zijn
> genummerd en komen met een certificaat van echtheid.

Let op die laatste zin. **Alleen de caps zijn genummerd**, niet de hele
collectie. Die fout is inmiddels drie keer gemaakt en staat daarom vast in
`tests/merkclaims.test.ts`. Buiten de repo vangt geen test hem, dus hier moet
je er zelf op letten.

Het blok "Het verhaal" in het profiel heeft dezelfde behandeling nodig; dat zet
het merk nu weg als kinderkledingwinkel.
| LinkedIn `/company/villahapp` | huidige pagina, staat in het schema | Website-URL en omschrijving nalopen |
| LinkedIn `/company/villa-happ` | oude keten, "The Kids' Fashion House" | Opheffen of samenvoegen als je er toegang toe hebt |

Let op het postadres. De KvK-afgeleiden noemen **Postbus 1, 5140 AA Waalwijk**,
terwijl `business.ts` als `postalAddress` sinds 25 augustus 2026 Vijzelweg 18E
aanhoudt. Dat veld is alleen een terugval zolang het vestigingsadres ontbreekt
en komt in de praktijk nergens op de site, dus het is geen zichtbare fout. Wil
je die postbus in de code, vul hem dan daar in; hij mag wél een postbus zijn.

## Categorie B: zakelijke gidsen

Deze lezen allemaal het Handelsregister uit. De meeste hebben een gratis
correctieformulier.

| Gids | Gegevens | Correctie mogelijk |
|---|---|---|
| [Infobel](https://www.infobel.com) | domein en e-mail nog op `villa-happ.nl`, naam, plaats en telefoon kloppen | ja |
| [Compadex](https://www.compadex.com/nl/businesses/nl/villa-happ-nederland-81998481-48256285) | adres klopt, geen website of e-mail vermeld | ja, "Onjuiste gegevens? Dien een verzoek in" |
| [Drimble](https://drimble.nl/bedrijf/waalwijk/000048256285/villa-happ-nederland.html) | **oud adres St. Antoniusstraat, 5144 AG** | ja, via inloggen en het profiel overnemen |
| [Telefoonboek.nl](https://www.telefoonboek.nl/bedrijven/t8390167/waalwijk/villa-happ-nederland/) | niet uitleesbaar (blokkeert bots) | handmatig nakijken |
| [Company.info](https://companyinfo.nl/organisatieprofiel/groothandel-in-bovenkleding/villa-happ-nederland-waalwijk-81998481-000048256285) | geen website, twee SBI-codes | geen zichtbare claimoptie |
| [Datanyze](https://www.datanyze.com/companies/villa-happ-nederland/556397802) | niet uitleesbaar (blokkeert bots) | meestal via een verwijderverzoek |
| [Oozo](https://www.oozo.nl/bedrijven/waalwijk/waalwijk/antoniusparochie/2213126/villa-happ-nederland) | wijkgebonden vermelding | onbekend |
| [Creditsafe Business Index](https://www.creditsafe.com) | kredietprofiel | via Creditsafe zelf |
| [Northdata](https://www.northdata.com) | voert **Villa Happ Outlets B.V.**, 's-Hertogenbosch, KvK 20115487 | oude rechtspersoon, laat staan |
| [Nextdoor](https://nextdoor.nl/pages/villa-happ-waalwijk-noord-brabant/) | buurtpagina Waalwijk | claimen kan |

## Categorie C: eigen kanalen

| Kanaal | Stand |
|---|---|
| [Instagram @villahapp_official](https://www.instagram.com/villahapp_official/) | actief, bio niet uitleesbaar. Controleer de link in de bio |
| [Facebook, Villa Happ Waalwijk](https://www.facebook.com/p/Villa-Happ-100064953071309/) | bestaat |
| Facebook, "VILLA HAPP The Kids Fashion Brand" | tweede, oudere pagina |
| LinkedIn | zie categorie A, twee pagina's |

Twee Facebook-pagina's en twee LinkedIn-pagina's. Hetzelfde patroon: een oude
en een nieuwe die om dezelfde naam concurreren.

## Categorie D: handel in het merk

Niet te corrigeren en ook niet erg, maar goed om te weten dat het bestaat.

- [Vinted](https://www.vinted.nl/brand/403502-villa-happ), meer dan 500 artikelen
- [Marktplaats](https://www.marktplaats.nl/l/kinderen-en-baby-s/q/villa+happ/), enkele honderden advertenties
- [Dedeshop](https://dedeshop.nl/7_villa-happ), kinderkleding-nl.eu, bewustopnieuw.nl

Dit is oude voorraad kinderkleding. Het houdt de merknaam levend, maar koppelt
hem wel aan kinderkleding in plaats van aan het huidige lifestylelabel.

## Categorie E: pers en archief

Permanent. Hier verander je niets aan, en dat hoeft ook niet: dit is de
geschiedenis die je storyline zelf ook vertelt. Wel is dit de bron waar AI-
modellen hun beeld vandaan halen, inclusief de foute oprichtersnaam.

- [FashionUnited](https://fashionunited.nl/tags/villa-happ), meerdere artikelen sinds 2007
- [Vakblad Kindermode](https://www.vakbladkindermode.nl/kinderkledingmerk-villa-happ-bezig-aan-comeback/), over de comeback
- [RetailTrends](https://retailtrends.nl/news/23528/villa-happ-voor-derde-keer-failliet), "voor derde keer failliet"
- [Nederlands Dagblad](https://www.nd.nl/nieuws/economie/749752/villa-happ-ging-failliet-met-miljoenenschuld), miljoenenschuld
- [Just Style](https://www.just-style.com/news/the-netherlands-villa-happ-declared-bankrupt-report/), internationaal
- [Twinkle](https://twinklemagazine.nl/2007/08/Villa_Happ_verstevigt_samenwerking_Wehkamp/index.xml), samenwerking Wehkamp
- [Waalwijk Nieuws](https://waalwijk.nieuws.nl/nieuws/kinderkledingmerk-villa-happ-bezig-aan-comeback), PropertyNL, Helvoirt.net
- [Faillissementsverslagen.com](https://www.faillissementsverslagen.com/faillissement/verslagen/verslag/she.10.491.F.V.03.B), curatorverslagen
- [winkels-nederland.nl](https://www.winkels-nederland.nl/winkels/Villa-happ.html), lijst met 32 winkels die sinds 2011 dicht zijn
- [Infoisinfo](https://groningen.infoisinfo.nl/kaart/villa-happ/968715), oude vestigingen Groningen en Uden

## Categorie F: domeinen naast je

- `villahapp.com` staat te koop bij HugeDomains. Een squatter, geen inhoud
- `villa-happ.nl` is van jou en stuurt correct door met een 308, geverifieerd
  op de homepage, `/i/ons-verhaal`, `/c/accessoires` en `/p/villa-happ-cap`

## Prioriteit

1. **Google Business Profile** claimen of aanmaken. Weegt het zwaarst en het
   ontbreekt vermoedelijk
2. **De dubbele LinkedIn-pagina** opruimen. Verdeelde signalen op precies het
   veld dat in je schema staat
3. **KvK** nalopen op website- en e-mailveld
4. **Drimble** corrigeren, want die voert een verkeerd adres
5. **Infobel** corrigeren, want die voert het oude domein
6. De rest volgt vanzelf zodra 1 tot en met 3 kloppen

## Wat ik niet heb kunnen vaststellen

- **De inhoud van het Google Business Profile.** Dat het bestaat is inmiddels
  bevestigd, met Knowledge Graph-id `/g/11yfcnmv6h`. De kennispaneelgegevens
  zelf zijn niet geautomatiseerd op te halen: Google leidt elk verzoek naar een
  toestemmingsscherm. Kijk zelf welke website-URL, categorie, adres en
  telefoonnummer erin staan.

  Dat dit profiel bij de eerste inventarisatie ontbrak heeft één oorzaak:
  bedrijfsprofielen leven in Maps en het kennispaneel, niet als een
  geïndexeerde webpagina, en het gebruikte zoekkanaal draait bovendien op de
  Amerikaanse index. Een Nederlands lokaal profiel komt daar niet in voor.
  Zoek er dus nooit naar via webzoekopdrachten; kijk in Maps of op
  business.google.com.
- De inhoud van **Telefoonboek.nl** en **Datanyze**. Beide blokkeren
  geautomatiseerd ophalen met een 403
- De **bio-link op Instagram**. Instagram serveert die niet aan bots
- Of de tweede LinkedIn- en Facebook-pagina onder jullie beheer vallen

## Waarschuwing

Je gaat post krijgen. Bedrijvengidsen sturen correctieverzoeken die in
werkelijkheid contracten zijn voor een betaalde vermelding, vaak met een
looptijd van drie jaar. Herkenbaar aan een vooraf ingevuld formulier dat je
alleen hoeft te "bevestigen".

Correcties doe je altijd zelf, via de site van de gids, op een account dat je
zelf hebt aangemaakt. Nooit door iets te ondertekenen dat naar je toe komt.
