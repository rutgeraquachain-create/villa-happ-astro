# Meetplan — GA4 en Google Ads

Wat we meten, waarom, en waarop het vuurt. Dit document gaat vóór de
implementatie: een tag zonder meetplan levert cijfers op die niemand kan
duiden. Wijkt de implementatie hiervan af, dan is de implementatie fout.

## Projectkaart

| | |
|---|---|
| Domein | `villahapp.nl` (apex; `www` doet 308 naar apex). `villa-happ.nl` verwijst permanent door. |
| Platform | Astro 6 op Vercel, met View Transitions (SPA-navigatie) |
| Betaalprovider | Mollie — iDEAL, Bancontact, Mastercard, Visa |
| Valuta | EUR |
| Tijdzone | Europe/Amsterdam |
| CMP | Eigen banner (`src/components/layout/ConsentBanner.astro`) |
| GTM-container | `GTM-PBFNLZ2M`, staat live |
| GA4-property | `G-KJH1QEH8HZ`, gekoppeld aan Search Console, Google-signalen aan |
| Google Ads | nog aan te maken; conversie via import van de GA4-key events |
| Bestaande tags | Geen. Alleen Vercel Web Analytics (cookieloos, blijft staan) |

Er staat bewust **geen** hardcoded `gtag.js` of GA4-plugin in de site. Alles
loopt via één GTM-container. Een tweede meetlijn ernaast levert dubbele
`page_view`- en `purchase`-hits op.

## Events

| Event | Vuurt op | Key event | Naar Ads | Waarde |
|---|---|---|---|---|
| `page_view` | elke paginaweergave, ook na een SPA-swap | nee | nee | — |
| `view_item` | productpagina geladen | nee | nee | prijs |
| `add_to_cart` | stuk toegevoegd aan mandje | nee | nee | prijs × aantal |
| `begin_checkout` | checkoutpagina geladen met een gevuld mandje | nee | nee | subtotaal |
| `purchase` | **bevestigde** betaling op de bedanktpagina | **ja** | **ja** | ordertotaal |
| `generate_lead` | contactformulier of merkaanmelding succesvol verstuurd | **ja** | optioneel | — |

### Waarom `purchase` pas bij een bevestigde betaling

Mollie stuurt de klant naar de bedanktpagina bij **elke** afloop — betaald,
mislukt, verlopen of afgebroken in de bankapp. De pagina haalt zelf de status
op bij `/api/checkout/status` en toont pas "Welkom in het archief" als die
`paid` teruggeeft.

`purchase` hangt aan diezelfde bevestiging. Zou hij op het laden van de
pagina vuren, dan tel je elke afgebroken betaling als omzet en stuur je
Google Ads aan op inkomsten die nooit binnenkwamen.

`transaction_id` is het bestelnummer (`VH-2026-…`), uniek per bestelling en
stabiel bij herladen. GA4 ontdubbelt daarop, dus een klant die de
bedanktpagina ververst telt één keer.

### Waarom `generate_lead` niet op de knop

Het contactformulier en de merkaanmelding posten naar `/api/contact`. Die
route geeft 503 als de mail niet verstuurd kan worden, en de pagina toont dan
een eerlijke foutmelding. `generate_lead` vuurt alleen op het antwoord waarin
`success` staat — niet op de klik, niet op de submit.

## Wat er nooit in mag

Geen persoonsgegevens naar GA4. Geen e-mailadres, naam, telefoonnummer of
adres, ook niet in parameters, ook niet in URL's of UTM's. De
`items`-parameters bevatten uitsluitend product-id, naam, prijs en aantal.

De bedanktpagina draagt een ondertekend token in de URL (`?t=…`). Dat is geen
PII, maar het hoort ook niet in een rapportage thuis; GA4 krijgt alleen het
bestelnummer uit het API-antwoord.

## Consent Mode v2

Alle vier de signalen staan standaard op `denied`, vóórdat GTM laadt:

```
analytics_storage · ad_storage · ad_user_data · ad_personalization
```

De banner werkt de signalen bij naar de keuze van de bezoeker. Twee knoppen,
gelijkwaardig gepresenteerd: alles accepteren of alleen noodzakelijk. Een
derde knop opent de details per categorie.

Weigert de bezoeker, dan blijft alles op `denied` en stuurt Google
cookieloze pings. Dat is bedoeld gedrag: je ziet dan modelmatige data in GA4,
geen nul.

Toestemming wordt nooit op `granted` gezet om een waarschuwing te laten
verdwijnen.

## Ads-conversieroute

**Route A: GA4-key event importeren in Google Ads.** GA4 is de bron van
waarheid; `purchase` en `generate_lead` worden daar als key event gemarkeerd
en in Ads geïmporteerd.

Kies je later Route B (native Ads-tag via GTM, nodig voor enhanced
conversions of view-through), zet dan de geïmporteerde GA4-conversie op
secundair. Dezelfde actie tweemaal als primaire conversie telt dubbel en
verpest je biedingen.

Auto-tagging blijft aan. `gclid` en `_gl` mogen nooit uit de URL gestript
worden — let daarop als er ooit een redirect of URL-opschoner bij komt.

## Testscenario vóór publicatie

Met Tag Assistant en GA4 DebugView:

1. Eerste bezoek → banner verschijnt, geen enkele hit vóór de keuze
2. Alleen noodzakelijk → signalen blijven `denied`, cookieloze pings
3. Analytics toestaan → `analytics_storage` op `granted`
4. Advertentie toestaan → alle vier op `granted`
5. Keuze wijzigen via de link in het cookiebeleid
6. Nieuwe pagina binnen de SPA → precies één `page_view`, niet nul en niet twee
7. Terugkerend bezoek → geen banner, keuze onthouden
8. Volledige bestelling → één `purchase` met het juiste bedrag
9. Afgebroken betaling → **geen** `purchase`
10. Bedanktpagina herladen → geen tweede `purchase`

Punt 6 en 9 zijn waar dit soort opstellingen in de praktijk stukgaat.

> **Doe dit testscenario op de live site en met de console open.** Gemeten
> 9 september 2026: elke `page_view` en elke `view_item` op villahapp.nl werd
> geblokkeerd door onze eigen CSP, en er is nooit iets in GA4 aangekomen.
>
> ```
> Connecting to 'https://region1.google-analytics.com/g/collect?...' violates
> the following Content Security Policy directive: "connect-src ..."
> ```
>
> GA4 verstuurt in Europa naar een regionaal adres, `region1.google-analytics.com`.
> De CSP stond `www.google-analytics.com` en `*.analytics.google.com` toe, en dat
> zijn allebei andere domeinen. `connect-src` staat sindsdien op
> `https://*.google-analytics.com`, en `tests/csp-meting.test.ts` bewaakt dat.
>
> **Waarom niemand het zag:** een geblokkeerd meetverzoek geeft geen fout op de
> server en geen lege grafiek die opvalt. Het staat alleen in de console van de
> bezoeker. Tag Assistant en DebugView draaien bovendien vaak op een omgeving
> zonder deze headers, en dan lijkt alles te werken. Controleer daarom altijd op
> het echte domein.

---

## Importbestand voor GTM

`docs/gtm-container-villa-happ.json` bevat alle tags, triggers en variabelen
uit dit meetplan. Importeren gaat zo:

1. GTM → **Beheer → Container importeren**
2. Kies het bestand, selecteer **Bestaande werkruimte** (of maak een nieuwe)
3. Kies **Overschrijven**, niet Samenvoegen. Bij samenvoegen blijft een
   eventueel bestaande `Google-tag` staan náást `Google-tag - GA4`, en dan
   configureren twee tags dezelfde property — dubbele pageviews.

   > Controleer wél eerst het verwijderlijstje in het voorbeeldscherm. Staat
   > daar iets dat je wilt houden, exporteer de werkruimte dan eerst.
4. Het meet-ID `G-KJH1QEH8HZ` staat al in de variabele **GA4 Meet-ID**;
   alle tags verwijzen ernaar. Wijzig je ooit van property, dan is dat de
   enige plek die je aanpast.
5. **Voorbeeldmodus** aanzetten en het testscenario hierboven doorlopen
6. Publiceren met een versienaam

### Wat er in zit

| Tag | Trigger |
|---|---|
| Google-tag - GA4 | Initialization – All Pages |
| GA4 - page_view | Custom Event `vh_page_view` |
| GA4 - view_item | Custom Event `view_item` |
| GA4 - add_to_cart | Custom Event `add_to_cart` |
| GA4 - begin_checkout | Custom Event `begin_checkout` |
| GA4 - purchase | Custom Event `purchase` |
| GA4 - generate_lead | Custom Event `generate_lead` |

Op de Google-tag staat `send_page_view` op **false**. De site is een SPA en
stuurt zelf een `vh_page_view` bij elke weergave, ook de eerste. Zou de tag
ook zijn eigen page_view sturen, dan telt de eerste pagina van elk bezoek
dubbel.

Geen van de tags heeft een extra toestemmingscontrole. Dat hoort ook niet:
Consent Mode v2 regelt dat op Google-niveau, en een tweede blokkade erbovenop
zorgt dat je ook de cookieloze pings kwijtraakt.

> **Google wijzigt zijn exportschema regelmatig.** Weigert de import of ziet
> een tag er leeg uit, meld het dan — dan pas ik het bestand aan. Importeer
> bij twijfel in een nieuwe werkruimte, dan raak je niets kwijt.
