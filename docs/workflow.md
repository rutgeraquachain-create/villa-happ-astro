# Werkwijze — code, deploy en DNS

Dit document beschrijft hoe je een wijziging van je laptop naar
`villahapp.nl` krijgt, en welke valkuilen daar onderweg liggen. Het is
geschreven na een livegang waarin een aantal daarvan is ingelopen: er is een
uur besteed aan een deploy die nooit kon werken omdat er naar de verkeerde
repository was gepusht.

Lees dit vóór je iets deployt. De vier kaders zijn de plekken waar het
daadwerkelijk misging.

---

## 1. Waar de dingen staan

| Wat | Waar |
|---|---|
| **Leidende repository** | `github.com/rutgeraquachain-create/villa-happ-astro` (remote `origin`) |
| Kopie | `github.com/GVDvet/villa-happ-astro` (remote `gvdvet`) |
| Vercel-project | `villa-happ-astro`, team `villa-happ-project` |
| Vercel-eigenaar | account `rutgeraquachain-7642` |
| DNS | **Strato** (`shades13.rzone.de` / `docks15.rzone.de`) |
| Mail | Microsoft 365 |
| Transactiemail | Resend, via subdomein `send.villahapp.nl` |
| Database | Supabase, project `Villa-Happ` (`xnlsuindjegvbcpmusnp`) |

> **Valkuil 1 — twee repositories.**
> Vercel bouwt **uitsluitend** uit `rutgeraquachain-create`. Een push naar
> `gvdvet` triggert niets en levert geen enkele foutmelding op: je ziet een
> geslaagde push, GitHub toont je commit, en er gebeurt verder niets. Zo is
> er een uur gezocht naar een "kapotte" Vercel-integratie die prima werkte.
>
> Controleer vóór een push waar je naartoe gaat:
> ```
> git remote -v
> ```
> `origin` hoort `rutgeraquachain-create` te zijn. Is dat niet zo, herstel
> het met `git remote rename`.

> **Valkuil 2 — het Vercel-account.**
> Het project staat op `rutgeraquachain-7642`, niet op het AIM ONLINE-team.
> De Vercel CLI ingelogd als `geoffreyvdvet-3039` krijgt bij dit domein
> `You don't have permission`. Dat is geen storing maar een scope-kwestie.
> Werk voor dit project in de browser, of log in met het juiste account.

---

## 2. Een wijziging naar productie

```bash
# 1. werken op een branch, nooit rechtstreeks op main
git checkout -b korte-omschrijving

# 2. controleren vóór commit
npx vitest run          # moet volledig groen
npx astro check         # moet 0 errors geven
npx astro build         # moet slagen; dit is wat Vercel straks ook doet

# 3. mergen en pushen
git checkout main
git merge --ff-only korte-omschrijving
git push origin main
```

De push naar `origin/main` triggert automatisch een productiebuild. Er is
**geen** handmatige stap nodig.

> **Valkuil 3 — de Redeploy-knop.**
> "Redeploy" in Vercel herbouwt **dezelfde commit** als de deployment waar
> je op klikt. Het haalt geen nieuwe code op. Wie na een push op Redeploy
> drukt bij de oude deployment, bouwt de oude code opnieuw — met de nieuwe
> environment-variabelen erin, wat het extra verwarrend maakt: `robots.txt`
> klopt dan wél en de pagina's niet.
>
> Wil je een nieuwe deployment zonder push, gebruik dan de knop waarmee je
> zelf een branch of commit kiest, en controleer dat er de juiste commit
> boven staat.

### Wanneer je de build cache moet uitzetten

Bij een wijziging aan een **environment-variabele**. De shoppagina's zijn
geprerenderd, dus `PUBLIC_SITE_URL` wordt tijdens het bouwen ingebakken in
canonical-tags, `sitemap.xml`, `robots.txt`, `llms.txt` en de links in de
transactiemails. Een build uit cache neemt de oude waarde mee.

---

## 3. Environment-variabelen

Dit is wat de code werkelijk uitleest. Afgeleid uit de broncode, niet uit
een checklist:

| Variabele | Zonder deze |
|---|---|
| `PUBLIC_SITE_URL` | site blijft op `noindex` staan, zie hieronder |
| `PUBLIC_SUPABASE_URL` | geen catalogus |
| `PUBLIC_SUPABASE_ANON_KEY` | geen catalogus |
| `SUPABASE_SERVICE_ROLE_KEY` | geen orders, voorraad of beheer |
| `MOLLIE_API_KEY` | geen betalingen; `test_` of `live_` |
| `AUTH_SECRET` | **afrekenen geeft 503**, minimaal 32 tekens |
| `ADMIN_PASSWORD_HASH` | geen toegang tot `/beheer` |
| `CRON_SECRET` | back-in-stock-verzender staat open |
| `RESEND_API_KEY` | geen transactiemail |
| `MAIL_FROM` | valt terug op de default in `src/lib/mail.ts` |
| `RESEND_WEBHOOK_SECRET` | `/api/mail/webhook` geeft 503; geen zicht op aflevering |
| `MAIL_ALARM_NAAR` | geen melding bij een bounce, alleen zichtbaar in `/beheer` |
| `PUBLIC_GTM_ID` | geen GTM, geen GA4, geen Ads, geen cookiebanner |

`DEV`, `PROD` en `VERCEL_GIT_COMMIT_SHA` hoef je niet te zetten.

### De Resend-webhook aanzetten

Twee stappen, allebei buiten de code.

1. Resend-dashboard, account Villa Happ, onder **Webhooks** een endpoint
   toevoegen op `https://villahapp.nl/api/mail/webhook`. Vink deze zes aan:
   `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`,
   `email.failed`, `email.complained`. Resend toont daarna een sleutel die met
   `whsec_` begint.

   `email.failed` hoort er echt bij. Dat is geen weigering door de ontvanger
   maar een mislukking bij Resend zelf, en het gevolg is hetzelfde: de mail is
   niet aangekomen. `duidGebeurtenis()` zet hem daarom op `gebounced` en slaat
   alarm. Vink je hem niet aan, dan valt precies die categorie stil weg.

   `email.received` hoort er **niet** bij. Dat gaat over binnenkomende mail via
   Resend, en de MX van `villahapp.nl` wijst naar Microsoft 365. Die
   gebeurtenis komt hier nooit langs; zou hij toch komen, dan wordt hij wel
   vastgelegd maar verandert hij niets aan de stand.

   `email.opened` en `email.clicked` blijven ook uit. Die vereisen een
   trackingpixel en herschreven links, en dat is voor een webshop met een
   privacyverklaring een losse afweging.

   Meer aanvinken kost niets. Resend rekent per verstuurde mail, niet per
   webhook-gebeurtenis (nagekeken op de prijspagina, 31 augustus 2026).
   Begrensd is alleen het aantal endpoints: vijf op Pro, tien op Scale, en wij
   gebruiken er één.
2. Die sleutel als `RESEND_WEBHOOK_SECRET` in Vercel zetten, plus
   `MAIL_ALARM_NAAR` met een adres **buiten** `villahapp.nl`. Daarna
   redeployen: Astro bakt deze waarden bij de build in de servercode.

> **Waarom dit ertoe doet.** `uitgaande_mail.status` gaat op `verzonden` zodra
> Resend de POST met 200 beantwoordt. Dat betekent "aangenomen", niet
> "aangekomen". Bij bestelling VH-2026-00001 stond de winkeliersmelding op
> `verzonden` met nul pogingen en geen fout, terwijl hij nooit in de inbox
> belandde. Zonder deze webhook is dat verschil onzichtbaar en meldt het
> systeem altijd het gunstigste. Met de webhook vult de kolom `aflevering`
> zich met wat de ontvangende server werkelijk deed.

Controleren of hij aankomt:

```sql
select soort, ontvanger, detail, ontvangen_op
from mail_gebeurtenissen order by ontvangen_op desc limit 10;
```

> **Valkuil 4 — `PUBLIC_SITE_URL` op Preview.**
> Zet deze **alleen op Production**. Staat hij ook op Preview, dan claimen
> previewdeploys de canonical van het echte domein en vervalt daar de
> noindex-bescherming — je previews gaan dan concurreren met je eigen site
> in Google.
>
> Preview hoort géén waarde te hebben. `src/lib/site.ts` valt dan terug op
> het `.vercel.app`-domein, en `isPreviewHost()` zorgt dat `robots.txt` daar
> `Disallow: /` teruggeeft. Dat is bedoeld gedrag, geen fout.

Het genereren van `AUTH_SECRET` en `ADMIN_PASSWORD_HASH` gaat in één keer:

```bash
npm run beheer:hash -- 'jouw-wachtwoord-hier'
```

Let op: de hash gebruikt dubbele punten als scheidingsteken, geen `$`. Een
`$` in een env-waarde wordt als variabele gelezen en sloopt de salt.

---

## 4. DNS

**Strato is autoritatief, voor beide domeinen.** Er staat ook een ongebruikte
zone in Vercel DNS voor `villa-happ.nl`; die doet niets zolang de nameservers
bij Strato staan. Wijzig DNS dus bij Strato, niet in Vercel.

`villahapp.nl` serveert de site. `villa-happ.nl` verwijst permanent door en
draagt voorlopig nog de mail — dat laatste verhuist mee zodra de postvakken
op het nieuwe domein bestaan.

### De records — beide domeinen dragen dit

| Type | Naam | Waarde |
|---|---|---|
| `A` | apex | `216.198.79.1` (Vercel) |
| `CNAME` | `www` | `2683e9e98ace7a22.vercel-dns-017.com.` |
| `CNAME` | `autodiscover` | `autodiscover.outlook.com.` |
| `MX` | apex | `villahapp-nl01c.mail.protection.outlook.com` (prio 10) |
| `TXT` | apex | `MS=ms71999403` — Microsoft-verificatie |
| `TXT` | apex | `v=spf1 include:spf.protection.outlook.com -all` |
| `TXT` | apex | `google-site-verification=…` |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=…` |
| `TXT` | `resend._domainkey` | DKIM voor Resend |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` |

### Waar het A-record zit bij Strato

Niet in de recordlijst. Het staat onder **DNS-beheer → A-record →
Bestemming**, waar je moet kiezen tussen "STRATO standaard IP-adres" en
"eigen IP-adres". Kies de tweede en vul het Vercel-IP in.

Zolang het domein aan een Strato-pakket of webshop gekoppeld is, kan die
keuze geblokkeerd zijn. Dan moet het domein eerst worden losgekoppeld — een
vraag voor Strato-support. De schermen "Domeinomleiding naar webshop" en
"Forward instellen" zijn niet wat je zoekt.

### Twee regels die je mail kosten

1. **Nooit twee SPF-records op dezelfde naam.** De root heeft er precies
   één (Microsoft) en `send` precies één (Amazon SES, voor Resend). Een
   tweede maakt beide ongeldig en dan valt ook je gewone mail om. Moet
   Resend erbij op de root, voeg dan een `include:` toe aan het bestaande
   record — geen nieuw record.
2. **DNSSEC uit vóór een nameserverwijziging.** Verhuis je de nameservers
   terwijl DNSSEC actief is, dan klopt de DS-sleutel bij SIDN niet meer bij
   de nieuwe zone en wordt het domein onbereikbaar verklaard — website én
   mail, zonder begrijpelijke foutmelding. Voor een gewone recordwijziging
   binnen Strato hoeft DNSSEC niet uit.

Strato's statusvlaggen lopen achter op de werkelijkheid. Vertrouw de
resolvers, niet het paneel:

```bash
nslookup -type=A villahapp.nl 8.8.8.8
```

---

## 5. Controleren na een deploy

De snelste bevestiging dat de **nieuwe** build live staat, is een route die
alleen in de nieuwe code bestaat opvragen. Werkt niet? Dan draait er nog een
oude deployment.

```bash
curl -sI https://villahapp.nl/voor-merken
```

Verder:

```bash
curl -s https://villahapp.nl/robots.txt
```

Hier hoort `Allow: /` te staan met een `Sitemap:`-regel op het echte domein.
Staat er `Disallow: /`, dan is `PUBLIC_SITE_URL` niet goed gezet of is de
build uit cache gekomen.

> **Let op bij het controleren.** Vercel cachet aan de edge; een `Age`-header
> van enkele minuten betekent dat je een oude versie ziet. Een query-string
> toevoegen helpt niet, want die telt niet mee in de cache-sleutel van
> geprerenderde pagina's. Test in dat geval via `villa-happ-astro.vercel.app`
> — andere hostname, andere cache.

---

## 6. Prijzen, voorraad en producten wijzigen

**Niet via `supabase/seed.sql`.** Elke insert daarin eindigt op
`ON CONFLICT … DO NOTHING`, dus op een gevulde database verandert opnieuw
draaien niets. Je krijgt geen foutmelding en de winkel blijft de oude prijs
rekenen. Dit is getest op de echte database: prijs van 21,95 naar 24,95 gezet
via de seed, en hij bleef 21,95.

Dat gedrag is bewust en moet zo blijven. `inventory.quantity` wordt door
verkopen verlaagd; zou de seed die kolom overschrijven, dan zet elke run de
voorraad terug op de startwaarde en verdwijnt wat er verkocht is.

Wijzigen doe je met een UPDATE in de Supabase SQL Editor:

```sql
-- Prijs
update products
set price_cents = 2495, updated_at = now()
where slug = 'villa-happ-back-cap';

-- Voorraad, per SKU
update inventory i
set quantity = 60, updated_at = now()
from product_variants pv
where pv.id = i.variant_id and pv.sku = 'VH-CAP-001';

-- Product uit de winkel halen zonder te verwijderen
update products set status = 'archived' where slug = 'stap-voor-stap-sokken';
```

Werk daarna `seed.sql` bij, zodat een verse database dezelfde cijfers krijgt.

> **Een prijswijziging is pas zichtbaar na een redeploy.** De shoppagina's zijn
> geprerenderd. De voorraad ververst zichzelf wél live via `/api/stock`, dus
> daarvoor is geen deploy nodig.

`compare_at_cents` blijft leeg: de site verkoopt niet met korting. Zie
`src/lib/catalog.ts`, dat de kolom niet uitleest en kortingsbadges wegfiltert.

### Database-migraties

Draai een migratie **vóór** de deploy die hem nodig heeft, anders schrijft de
code naar tabellen die nog niet bestaan. `schema.sql` bevat alles voor een
verse database en is meermaals achter elkaar draaibaar zonder fouten.

Migraties die nog niet zijn uitgevoerd staan in `supabase/migrations/`. Op dit
moment ligt `20260803_retouren.sql` klaar: die hoort bij het retourscherm in
`/beheer` dat nog gebouwd moet worden, en doet zonder dat scherm niets.

---

## 7. Orderbeheer

`/beheer` draait op één wachtwoord (`ADMIN_PASSWORD_HASH`). Daar zie je
bestellingen, zet je ze op verzonden of bezorgd, en verwerk je terugbetalingen.

Het klantportaal op `/bestelling/<token>` werkt op een ondertekend
capability-token uit de bevestigingsmail — geen account nodig.

Wat je na de eerste echte bestelling controleert:

- Staat de bestelling in `/beheer`?
- Zet hem op verzonden met een tracking en kijk of de mail aankomt
- Open de klantlink onderaan de orderpagina en controleer de tijdlijn
- Zet hem op bezorgd en controleer de tijdlijn opnieuw

Mail loopt via een outbox: elke mail wordt eerst vastgelegd in
`uitgaande_mail` en pas daarna verstuurd. Blijft er iets op `wacht` staan, dan
gaat het alsnog de deur uit bij de volgende cron of via "Nu verwerken" in
`/beheer`. Vercel Hobby staat één cron per dag toe; bij drops van honderden
stuks wil je Pro met een cron per uur.

---

## 8. Dingen die je niet moet doen

- **De Dependabot-branch `astro-7.0.7` mergen.** Astro 7 is eerder
  teruggedraaid wegens een whitespace-regressie op elke pagina (#27). Zie
  `docs/astro-7-migratie.md` voordat je het opnieuw probeert.
- **Onbekende sleutels in `vercel.json` zetten.** JSON kent geen commentaar
  en Vercel weigert sleutels die het niet kent; dat brak elke build (#36).
  Toelichting hoort in de code, niet in dat bestand.
- **"DNS-instellingen resetten" bij Strato.** Dat zet de zone terug naar
  standaard en gooit `MX`, SPF, DKIM en DMARC weg. Je mail ligt er dan uit.
- **Rechtstreeks op `main` committen.** De productiebranch bouwt direct naar
  het live domein.
- **Prijzen wijzigen via `seed.sql`.** Zie hoofdstuk 6: het lijkt te werken en
  doet niets.
- **`AUTH_SECRET` roteren.** Alle volglinks die al in mailboxen van klanten
  liggen verlopen dan. Zet hem één keer goed.
- **Een `$` in `ADMIN_PASSWORD_HASH`.** De hash gebruikt dubbele punten als
  scheidingsteken; een `$` in een env-waarde wordt als variabele gelezen,
  waarna de salt verdwijnt en het juiste wachtwoord een 401 geeft zonder
  enige foutmelding.

---

## 9. Waar de bron van waarheid ligt

Wijzig gegevens op één plek; de rest volgt automatisch.

| Wat | Bestand |
|---|---|
| KvK, btw, adressen, mailadres, retourtermijnen | `src/lib/business.ts` |
| Verzendtarieven en gratis-verzendgrens | `src/lib/shipping.ts` |
| Juridische formuleringen (retour, levering, btw) | `src/lib/legal.ts` |
| Merkfeiten voor schema en llms.txt | `src/lib/entity.ts` |
| Domein en indexeerbaarheid | `src/lib/site.ts` |
| Retourberekening | `src/lib/retour.ts`, uitgewerkt in `docs/retourbeleid.md` |

Hardcodeer geen bedragen, adressen of termijnen in een pagina. Dat is eerder
misgegaan: verzendkosten stonden op vijf plekken los ingetypt en liepen uit
de pas met wat de checkout werkelijk rekende.

---

## 10. Openstaande punten

Overgenomen uit de opleverchecklist, die in dit document is opgegaan.
Werk ze bij wanneer ze veranderen; dit is de enige plek waar ze staan.

### Nog te beslissen

| | Vraag | Waarom het uitmaakt |
|---|---|---|
| 🔴 | **Heet de hoodie "Olijfgroen"?** De foto is saliegroen (gemeten `#828875`), niet olijf. Het kleurstaal is met de foto gelijkgetrokken; de naam is een keuze: hernoemen of opnieuw fotograferen. | Kleurverwachting versus levering is dé retouroorzaak in fashion |
| 🔴 | **Blijven de sokken in de shop?** Ze hebben nu het logo als productfoto, 256×256 uitgerekt in een 600×750 kader. | Twee van de vijf producten hebben geen echte foto |
| 🟠 | **Klopt "Vercel Web Analytics gebruikt geen cookies"?** Zo staat het in het cookiebeleid, omdat het product cookieloos is. | Klopt het niet, dan is er wél een cookiebanner nodig |
| 🟠 | **Worden `/drops` en `/brands` gevuld, of eruit?** Beide staan op `noindex` en buiten de sitemap. `/brands` is bovendien uit de navigatie gehaald. | Lege pagina's in de nav kosten vertrouwen |
| 🟢 | **Dubbele opt-in op de nieuwsbrief?** Nu enkele opt-in met een expliciete toestemmingscheckbox. | Dubbele opt-in is bewijsbaarder bij een AVG-klacht |

### Bekende grenzen

| | Onderwerp | Toelichting |
|---|---|---|
| 🔴 | **Echte productfotografie** | De beelden ogen als AI-mockups, met wisselende achtergrondkleuren tussen voor- en achterkant. Op de achterkantfoto's is geen borduursel te zien, terwijl Het Atelier "geborduurd, niet geprint" als kernbelofte voert. Voor een merk dat op vakmanschap leunt is dit de investering met de hoogste opbrengst. |
| 🟠 | **Geen 2FA op `/beheer`** | Eén wachtwoord. Voor een eenmanszaak verdedigbaar, maar een tweede factor is de logische volgende stap. |
| 🟠 | **Retourscherm ontbreekt** | `src/lib/retour.ts` rekent de terugbetaling uit en is getest, maar er is nog geen scherm in `/beheer` en de tabellen uit `20260803_retouren.sql` zijn niet uitgerold. Retouren verwerk je nu handmatig. |
| 🟢 | **Telefoonnummer ontbreekt** | Staat als `PENDING` in `business.ts`. Niet verplicht, wel een sterk vertrouwenssignaal in een webshop. |
| 🟢 | **CSP heeft `'unsafe-inline'`** | Nodig omdat Astro inline scripts genereert en er bij een statische build geen nonce per request bestaat. Alle plekken waar HTML uit variabelen wordt samengesteld escapen hun invoer; dat is geverifieerd. |
| 🟢 | **3D-viewer staat uit** | Zet je hem aan, dan laadt `@google/model-viewer` decoders van `gstatic.com` en `jsdelivr.net`. Die staan niet in de CSP, dus de viewer blijft zwart zonder zichtbare fout. |
| 🟢 | **DNSSEC staat uit** | Uitgezet voor een nameserververhuizing die uiteindelijk niet nodig bleek. Het register heeft geen DS-sleutel meer. Opnieuw activeren bij Strato mag, maar heeft geen haast. |

### Afgerond

- **Supabase** — uitgerold 2 augustus 2026. 16 tabellen met RLS, 10 functies, 5 gepubliceerde producten met 15 varianten en voorraad. De adviseur meldt tienmaal `rls_enabled_no_policy` op INFO-niveau; dat is het ontwerp, niet een probleem: RLS aan zonder policies betekent dicht voor de publieke sleutel, en alleen de servercode komt erbij met de service-role key.
- **Bedrijfsgegevens** — btw-id, bezoekadres, postadres en retouradres staan in `business.ts`. Alleen het telefoonnummer is nog `PENDING`.
- **Resend** — `villahapp.nl` geverifieerd, DKIM op `resend._domainkey`, SPF en bounce-MX op subdomein `send`. DMARC op `p=none` met rapportage naar `rutger@villahapp.nl`; verzwaren naar `p=quarantine` zodra de rapporten schoon zijn. Het oude domein is uit Resend verwijderd (het gratis plan houdt er één), maar de DNS-records van `villa-happ.nl` staan er nog: dat is de weg terug als het nieuwe domein ooit stukloopt.
- **Mailadres** — `contact@villahapp.nl` als alias op het bestaande postvak, met `@villahapp.nl` als primair adres. De adressen op `@villa-happ.nl` blijven als alias bestaan: die staan in bestelbevestigingen die al verstuurd zijn. `MAIL_FROM` in Vercel moet meeveranderen, en Astro bakt die waarde bij de build in, dus een redeploy hoort erbij.
- **Mollie** — sleutel staat op `live_`. De checkout stuurt géén methodelijst mee, dus Mollie toont alles wat op het profiel aanstaat. Wat de site erover zegt staat in `BUSINESS.paymentMethods`; zet je bij Mollie iets aan of uit, pas dan die ene lijst aan. De webhook-URL is `https://villahapp.nl/api/checkout/webhook`.
- **Domein** — `villahapp.nl` live op Vercel, `www` doet een 308 naar de apex, HSTS actief. `villa-happ.nl` verwijst permanent door; zie `docs/domeinmigratie.md`.

### Eerste echte bestelling

De sleutel staat op live, dus dit kost echt geld. Doe één bestelling en
controleer:

1. Betaling voltooien → "Welkom in het archief", mandje leeg, bevestigingsmail
2. Betaling annuleren → "Er is niets afgeschreven", **mandje intact**, geen bestelling
3. Controleer in Supabase dat bij 2 de voorraad is teruggegeven (`inventory.reserved` omlaag)
4. Loop daarna het orderbeheer na, zie hoofdstuk 7

Scenario 2 is de belangrijkste: die ging eerder mis doordat de bedanktpagina
"bedankt" zei zonder de betaling te controleren.

### Google

- Search Console is al geverifieerd via het TXT-record; sitemap indienen op `https://villahapp.nl/sitemap.xml`
- Rich Results Test draaien op een productpagina (ProductGroup + FAQ + Breadcrumb)

---

## 11. Meting (GA4 en Google Ads)

Het meetplan staat in [`meetplan.md`](meetplan.md). Dat gaat vóór de
implementatie: wijkt de code ervan af, dan is de code fout.

De site-kant is gebouwd en getest, maar staat **uit** tot `PUBLIC_GTM_ID`
gezet is. Zonder die variabele laadt er geen GTM, verschijnt er geen
cookiebanner, en zegt `/cookies` dat er niets te kiezen valt. Dat is bewust:
een banner tonen voor cookies die niemand zet is zelf een overtreding.

### Wat jij nog in Google moet doen

1. **GTM-container** aanmaken op naam van Villa Happ, type Web, met minimaal
   twee beheerders. Het id (`GTM-…`) gaat als `PUBLIC_GTM_ID` in Vercel,
   alleen op Production.
2. **GA4-property** met een webstream, tijdzone Europe/Amsterdam, valuta EUR.
   Het meet-ID hoort in GTM, **niet** in de code — een tweede meetlijn naast
   de container levert dubbele `page_view` en `purchase` op.
3. In GTM: **Google-tag** op *Initialization – All Pages*, en per event uit
   het meetplan een GA4-eventtag met een Custom Event-trigger.
4. **Key events** markeren in GA4: alleen `purchase` en `generate_lead`.
   Nooit `page_view`.
5. **GA4 aan Google Ads koppelen**, auto-tagging aan, en die twee key events
   importeren als conversie. Meet dezelfde actie nooit tegelijk als
   geïmporteerde én native conversie.

### Wat al klaarstaat

- Consent Mode v2, alle vier de signalen standaard op `denied`, gezet in de
  `<head>` vóór GTM laadt
- Eigen cookiebanner met gelijkwaardige knoppen, keuze per categorie, en een
  heropenlink in het cookiebeleid
- `page_view` op elke SPA-navigatie — zonder dit meet je alleen de eerste
  pagina van een bezoek
- `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `generate_lead`
- `purchase` op de bevestigde betaling, met het ordertotaal vanaf de server

### Waarom het bedrag van de server komt

`/api/checkout/status` geeft bij een betaalde bestelling het ordertotaal en
de regels mee. De bedanktpagina zou dat ook uit het mandje kunnen halen, maar
dat is precies de waarde die een bezoeker kan manipuleren — en het mandje is
op dat moment al geleegd.

### De CSP hoort erbij

`googletagmanager.com` staat in `script-src`, de Google-meetdomeinen in
`connect-src` en `img-src`, en `frame-src` staat niet meer op `'none'` omdat
Ads-conversies een iframe gebruiken. Voeg je een tag toe die een ander domein
aanspreekt, dan blokkeert de browser hem — zonder duidelijke melding, met een
lege property als gevolg.

### Testen kan niet op localhost

`isPreviewHost()` telt localhost als preview, dus GTM laadt daar bewust niet.
De logica is in plaats daarvan afgedekt met unit tests
(`tests/consent.test.ts`, `tests/analytics.test.ts`). Voor een echte
end-to-end test gebruik je Tag Assistant en GA4 DebugView op productie; het
scenario staat onderaan het meetplan.
