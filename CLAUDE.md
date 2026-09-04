# Villa Happ storefront

Astro 6 met Supabase en Mollie. Pagina's zijn geprerenderd, de API-routes onder
`src/pages/api/` draaien serverless. Deploy via Vercel.

Dit bestand is de ingang voor een agent. Voor deploy, DNS, environment-variabelen
en orderbeheer is `docs/workflow.md` de autoriteit. Herhaal dat hier niet, verwijs
ernaar.

## Werkwijze

Elke functionele of zichtbare wijziging doorloopt de skill `audit-loop`:
audit, verifieer, deploy, terugschrijven. De poorten hieronder zijn de invulling
daarvan voor dit project.

**Merge nooit zelf.** De agent levert een groene PR met bewijs. Mergen doet
Geoffrey. Zie `Samenwerken tussen agents` in de vault.

Werk op een branch, nooit rechtstreeks op `main`.

## Commando's

```bash
npm run dev      # astro dev, poort 4321
npm run build    # astro build
npx astro check  # moet 0 errors en 0 warnings geven
npm test         # vitest, 151 tests
```

`npm run beheer:hash -- 'wachtwoord'` genereert de hash voor `/beheer`.

## Poort 1: audit

CI staat in `.github/workflows/ci.yml` en draait op elke PR. Die moet groen zijn.
De job doet secret-scan, frozen install, typecheck, tests, build zonder keys en
een output-controle op de gebouwde bestanden.

Lokaal is de volgorde: `npx astro check`, `npm test`, `npm run build`.

> **Controleer de build op output, niet op de afwezigheid van het woord ERROR.**
> `astro build` kan falen met `EPERM` en tóch exitcode 0 teruggeven. Dat gebeurt
> als een proces een map in `dist/` vergrendelt, bijvoorbeeld een lokale
> testserver die daar zijn werkmap heeft. De build lijkt dan te slagen terwijl er
> verouderde output blijft staan, en je meet vervolgens aan een build zonder je
> eigen wijziging. Test op `test -s dist/client/index.html`, of draai een server
> vanuit een kopie buiten de repo.

## Poort 2: verifieer

Toon de gewijzigde pagina werkend, met bewijs. Wat dat bewijs is, hangt af van
wat je raakte:

- **Zichtbare wijziging:** renderen van 360 tot 2560 px, dpr 1 en 2, plus
  Chromium, Firefox en WebKit. Screenshot als bewijs, of een DOM-meting van
  `scrollWidth - clientWidth` bij overflow.
- **Alleen JSON-LD, meta of schema:** een apparatenmatrix bewijst niets. Toon in
  plaats daarvan de gebouwde waarden op alle betrokken pagina's, en dat het de
  DOM niet raakt.
- **Altijd:** de geraakte kernflow, niet alleen het nieuwe stukje.

> **Een voorbeeldweergave rendert de echte bron, of hij bewijst niets.** Een
> preview-scherm hoort dezelfde gegevens te lezen als productie. Lukt dat niet
> omdat er een bestelling of een gebruiker voor nodig is, zet de toets dan op de
> echte bron in plaats van op verzonnen invoer. Gemeten 2 september 2026:
> `/dev/mail/mailing` voedde de opmaakfunctie met een oefentekst die in de code
> stond, terwijl de echte tekst uit `src/content/mailings/` komt. Die oefentekst
> had korte regels, het echte bestand was op tachtig tekens afgebroken, en de
> opmaakfunctie maakte van elk regeleinde een harde afbreking. Het voorbeeld kón
> de fout dus niet tonen. Hij kwam pas boven water toen een mens de verstuurde
> mail zag, met het woord "Wat" alleen op een regel.
>
> `tests/mailing.test.ts` leest daarom `src/content/mailings/*.md` zelf. Let bij
> zo'n toets op de lege map: `it.each([])` draait nul keer en meldt groen, dus er
> hoort een assertie bij dat er überhaupt bestanden zijn.

> **De homepage bewijs je alleen door hem echt te scrollen.** Een gemeten
> DOM-volgorde zegt dat de secties op de juiste plek stáán, niet dat de pagina
> goed leest. Gemeten 26 augustus 2026: na een herschikking klopte de volgorde,
> waren er nul overloop en evenveel pins als daarvoor, en stond er tóch een
> leeg scherm van bijna twee schermhoogtes midden in de pagina. Dat is live
> gegaan. Loop de pagina van boven naar beneden af en kijk per schermhoogte of
> er inhoud staat.

Verifiëren op deze site is lastiger dan elders, want er zit Lenis (smooth
scroll) en GSAP met gepinde secties op. Wat niet werkt:

- **De browserpane** rapporteert hier vaak 0 bij 0, en als de pane niet
  zichtbaar is rendert hij geen frames. Dan draait er geen rAF, beweegt Lenis
  niet, en meet je een pagina waarvan de pins nog niet berekend zijn.
- **`--virtual-time-budget` met `--dump-dom`** spoelt timers vooruit maar laat
  die rAF-lus niet meelopen. Synthetische wheel-events komen dan niet aan.
- **`window.scrollTo`** wordt door Lenis teruggedraaid.
- **`--window-size`** klemt op ongeveer 500 css-px, dus een test op "390 px"
  draait in werkelijkheid op 500.

Wat wél werkt is Chrome aansturen via het DevTools-protocol: echte
muiswiel-events die Lenis wel oppikt, `Page.captureScreenshot` voor een echt
beeld, en `Emulation.setDeviceMetricsOverride` voor een exacte viewport. Het
script staat in de scriptbibliotheek onder `cdp-scrollpagina`. Let op de vlag
`--remote-allow-origins=*`, zonder die weigert Chrome de websocket.

## Poort 3: deploy

`docs/workflow.md` sectie 2. Kort:

Push naar `origin`, dat is `rutgeraquachain-create/villa-happ-astro`. **Vercel
bouwt uitsluitend daaruit.** De remote `gvdvet` is een spiegel: pushen daarheen
triggert niets en geeft geen foutmelding.

Merge naar `main` triggert automatisch een productiebuild. Controleer live met de
buildvingerafdruk:

```bash
curl -s https://villahapp.nl/ | grep -o 'vh-build" content="[^"]*"'
```

Die moet de merge-commit tonen. Staat er nog een oudere sha, dan draait de deploy
nog.

## Poort 4: terugschrijven

Werk bij de merge de projectnotitie in de vault bij: stand, wat je deed, volgende
stap.

## Invarianten

Breek deze niet zonder overleg.

**Producten komen op build-moment uit Supabase.** `src/lib/catalog.ts` leest de
database als die geconfigureerd is, en valt anders terug op `src/lib/demo-products.ts`.
Is Supabase wél geconfigureerd maar faalt de query, dan breekt de build met opzet:
stil terugvallen op demo-data zou live verkeerde prijzen en voorraad tonen.

**Beeldpaden staan óók in Supabase**, in `products.image_url` en
`products.gallery`. Hernoem je een bestand in `public/img/products/`, werk dan de
database in hetzelfde ritme bij, en doe dat vóór je de branch pusht. Anders wijst
de eerste productiebuild naar bestanden die niet meer bestaan. Zet er 301's bij in
`vercel.json` voor de oude paden, want die kunnen in Google Afbeeldingen staan.

**Vervang de inhoud van een beeld nooit op hetzelfde pad.** `/img/(.*)` staat in
`vercel.json` op `max-age=31536000, immutable`. Wie de oude versie al heeft
gezien, krijgt hem daarna een jaar lang uit zijn cache, en `/_vercel/image` houdt
zijn afgeleide varianten net zo lang vast. Een verbeterd beeld krijgt dus een
nieuwe bestandsnaam plus een 301 vanaf de oude, precies zoals bij hernoemen. De
301's dekken meteen het gat tussen de database-update en de merge af, want een
build met oude paden landt dan alsnog op het nieuwe bestand.

**Er hangt een tweede beeldset aan `public/img/products/`.** `mailBeeld()` in
`src/lib/mail.ts` vertaalt elk productpad naar `/img/mail/<zelfde naam>.jpg`,
want Outlook rendert geen WebP. Hernoem je een productfoto, draai dan
`node scripts/mail-assets.mjs` en ruim de wees-JPG's op, anders staat er een
kapot icoontje in de bestelbevestiging.

**`src/lib/demo-products.ts` moet dezelfde beelden voeren als Supabase.** CI
bouwt zonder sleutels en valt dus op deze demo-data terug. Wijkt die af, dan
bewijst een groene CI-build niets over de echte beeldpaden. Gemeten 31 augustus
2026: de sokken hadden hier het merklogo als plaatshouder, waardoor de sokfoto's
in geen enkele lokale build of CI-controle voorkwamen.

**`src/lib/business.ts` is de enige bron voor bedrijfs- en juridische gegevens**:
KvK, btw-id, adressen, retouradres, telefoon, retourtermijnen. De juridische
pagina's, het schema, de footer en de transactiemails lezen daar. Ontbrekende
waarden staan op de sentinel `PENDING`, waardoor pagina's "volgt" tonen in plaats
van een halve zin. Zet nooit een verzonnen waarde in de plaats.

Let op de twee adresvelden. `businessAddress` is wat de site publiceert als
vestiging en gaat het schema in, `returnAddress` is waar consumenten retouren
heen sturen. Sinds 25 augustus 2026 voeren ze dezelfde waarde, Vijzelweg 18E,
maar ze blijven gescheiden omdat hun rollen verschillen. Er is geen bezoekadres.

Het veld heette eerder `registeredAddress` en voerde de KvK-inschrijving,
Besoyensestraat 90. Dat is het woonadres van de eigenaar en hoort niet op een
webshop. De site wijkt daarmee bewust af van het Handelsregister zolang dat niet
is bijgewerkt. Zet dat niet terug om de bronnen te laten matchen; de toelichting
staat in `src/lib/business.ts` en in `docs/vindbaarheid-vermeldingen.md`.

**`status` en `aflevering` in `uitgaande_mail` zijn twee verschillende dingen.**
`status` beschrijft de wachtrij: is de mail de deur uit. Hij gaat op `verzonden`
zodra Resend de POST met 200 beantwoordt, en dat betekent **aangenomen**, niet
aangekomen. `aflevering` beschrijft wat de ontvangende server ermee deed en
wordt uitsluitend door de Resend-webhook gevuld (`/api/mail/webhook`). Zet die
twee nooit samen, en laat de verzendcode `aflevering` nooit op iets goeds
zetten. Gemeten 25 augustus 2026: de winkeliersmelding bij VH-2026-00001 stond
op `verzonden` met nul pogingen en geen fout, terwijl hij nooit in de inbox
belandde; er is zes dagen in de verkeerde richting gezocht omdat het systeem
alleen het gunstigste kon melden. De koppelsleutel is `provider_id`, de id die
Resend teruggeeft; `verstuurDirect()` moet die blijven doorgeven, anders valt de
webhook terug op raden.

**`src/lib/entity.ts` is de enige bron voor merkfeiten**: de canonieke definitie,
het merkverhaal, de kernfeiten, `sameAs`. Die voedt het Organization-schema,
`llms.txt` en de perspagina. Eén wijziging daar loopt overal in mee, en dat is de
bedoeling: consistentie over bronnen is precies wat zoek- en AI-engines wegen.

**De preview-guard mag niet omzeild worden.** Hij bestaat uit twee delen die op
een ander moment werken, en dat onderscheid is belangrijker dan het lijkt.

De `X-Robots-Tag: noindex, nofollow` komt uit `vercel.json` en is gekoppeld aan
de **hostnaam** in het verzoek. Die geldt dus op elke `*.vercel.app`, ook op de
productie-alias.

`robots.txt` wordt geprerenderd (`src/pages/robots.txt.ts`) en beslist op
`PUBLIC_SITE_URL` **ten tijde van de build**, niet op de hostnaam van het
verzoek. Een preview-deploy bouwt zonder die variabele, valt terug op
`DEFAULT_SITE` en krijgt `Disallow: /`. Dat is wat CI toetst, en dat werkt.

**Maar de productie-alias `villa-happ-astro.vercel.app` serveert de
productiebuild**, dus daar staat de gewone `robots.txt` met `Allow: /`. Gemeten
31 augustus 2026. Dat is geen bug om te repareren: `Disallow` op die host zou
het slechter maken, want een crawler die niet mag ophalen ziet de `noindex`
nooit en kan de URL alsnog kaal opnemen. Blokkeren en noindex bijten elkaar;
noindex werkt alleen als de crawler binnen mag. De header plus de canonical naar
het echte domein doen daar het werk.

Verander `robots.txt.ts` dus niet naar server-rendered om "de host te kunnen
lezen". Dat is precies de verbetering die de bescherming verzwakt.

**Beloof in schema niets dat de voorwaarden niet waarmaken.** Geen
`aggregateRating` zonder echte reviews, geen `FreeReturn` terwijl de klant de
retourzending betaalt, geen verzonnen `gtin`.

## Valkuilen, gemeten

**Twee werkmappen, één repo.** `vh-domein-villahapp` en `Astro_Website` zijn
worktrees van dezelfde repository. `main` staat uitgechecked in `Astro_Website`,
dus `git checkout main` in de andere map faalt met "already used by worktree".
Werk met `git checkout -B <branch> origin/main`.

**Google accepteert voor `returnFees` maar drie waarden:** `FreeReturn`,
`ReturnFeesCustomerResponsibility` en `ReturnShippingFees`. `RestockingFees`
bestaat wel bij schema.org maar valt buiten dat drietal en levert "Ongeldige
enum-waarde" op in Search Console. `restockingFee` is een losse eigenschap zonder
eis over `returnFees`; alleen `returnShippingFeesAmount` heeft zo'n koppeling.

**Schema-wijzigingen raken de varianten apart.** Google erft niets van een
`ProductGroup` naar zijn `hasVariant`-items: elk item wordt als los product
beoordeeld. Controleer je markup dus op de groep én op elke variant.

**Gepinde secties moeten verversen in paginavolgorde, niet in codevolgorde.**
ScrollTrigger ververst triggers in de volgorde waarin je ze aanmaakt. Staat er
een pin bóven je die later wordt geïnitialiseerd, dan rekent jouw pin met een
pagina waarin die spacer nog ontbreekt en eindigt hij te vroeg. Gemeten: door
het cine-blok boven de tijdlijn te zetten liet die tijdlijn 1572 px te vroeg
los, ongeveer de pin-duur van het cine-blok, met een leeg scherm als gevolg.
`pinPrioriteit()` in `src/lib/motion.ts` leidt de `refreshPriority` af uit de
plek in het document, zodat herschikken van de homepage dit niet opnieuw breekt.
Voeg je een nieuwe gepinde sectie toe, geef hem die `refreshPriority` mee.

**Filmkorrel op een beeld dat nog lossy gecodeerd wordt, werkt averechts.** Bij
de sokbeelden is korrel toegevoegd zodat de gerekende achtergrond niet gladder
zou zijn dan het onderwerp. Twee fouten. Ten eerste kwam het getal (sigma 4,2)
uit een meting op de bronfoto op volle resolutie, terwijl de uitsnede daarna naar
het doek verkleind wordt en verkleinen ruis uitmiddelt: het onderwerp mat op
canvasformaat nog maar sigma 0,82, dus de achtergrond kreeg vijf keer zoveel
korrel als de sok. Ten tweede overleeft fijne korrel een webp-encode niet. De
encoder kan hem niet vasthouden, besteedt er wel bits aan, en levert
laagfrequente vlekken op. Het 5-pack woog 128 kB/MP tegen 65 voor een beeld
zonder korrel, en oogde korrelig. Meet de ruis van het onderwerp op de maat
waarop het geplaatst wordt, en houd de korrel daar gelijk aan of net onder.

**Een 323 px bron in een slot van 1080 px.** `hoodie-logo-detail.webp` was
323×432 en werd door `Pic` met `widths={[480,640,768,1080]}` en de lightbox op
1920 tot ruim drie- en zesvoudig opgeschaald. Dat leest als korrel maar is
opschaling. Er valt niets aan te repareren met compressie: de oplossing was een
echte uitsnede van 1080×1350 uit `hoodie-olijfgroen-lifestyle-2.webp`. Controleer
bij een klacht over beeldkwaliteit dus eerst de bronresolutie tegen de grootste
`widths`-waarde, vóór je naar de encoder kijkt.

**Absoluut gepositioneerde koppen naast gecentreerde media.** In `src/styles/home.css` liep
de drop-titel over het cap-beeld zodra het venster laag werd, omdat beide hun
clamp-ondergrens raakten. Schaalt een kop alleen op `vw`, dan blijft hij groot op
een breed maar laag scherm. Leg zulke relaties vast in de CSS in plaats van te
hopen dat de getallen uitkomen.

## Schrijven

Nederlands. Geen em dashes, gebruik punten, komma's of dubbele punten. Hoofdletter
na elke punt, vraagteken en uitroepteken. Vermijd AI-tics: geen "niet X, maar
Y"-antithese, geen buzzwords.

Commit-berichten leggen uit waaróm iets veranderde, niet alleen wat. Noem de
meting of het bewijs. **Geen Claude-coauthor-trailer.**

De codecommentaren in dit project zijn Nederlands en leggen de reden vast, vaak
met wat er eerder misging. Houd die lijn aan: een commentaar dat alleen herhaalt
wat de code doet, voegt niets toe.

## Waar wat staat

| Onderwerp | Bestand |
|---|---|
| Deploy, DNS, env, orderbeheer | `docs/workflow.md` |
| Meetopstelling, GA4, Ads, consent | `docs/meetplan.md` |
| Retourbeleid, juridische onderbouwing | `docs/retourbeleid.md` |
| Domeinmigratie naar villahapp.nl | `docs/domeinmigratie.md` |
| Bedrijfs- en juridische gegevens | `src/lib/business.ts` |
| Merkentiteit en kernfeiten | `src/lib/entity.ts` |
| Juridische zinnen, verzendtabel | `src/lib/legal.ts` |
| Catalogus, Supabase met demo-fallback | `src/lib/catalog.ts` |
| Scroll- en pinanimaties | `src/lib/motion.ts` |
| CI-poort | `.github/workflows/ci.yml` |
| Redirects en headers | `vercel.json` |

## Als een aanname sneuvelt

Blijkt er tijdens het werk iets anders te zijn dan gedacht (een toets die niets bewees, een oplossing die om een andere reden werkte dan je dacht, een prijs die niemand had benoemd), leg dat dan vast met de skill `lesvastleggen`. Niet bij elk antwoord: alleen als je de zin "ik dacht dat X, en dat was niet zo" met iets concreets kunt invullen.

De les bevat een oplossing die de fout voortaan tegenhoudt. **Is dat een projectregel, zet hem dan ook echt in dit bestand.** Een oplossing die alleen in het dagboek staat, houdt niets tegen.

- De regel: `Jarvis/_canon/Lessendagboek.md`
- Waaraan zo'n instructie moet voldoen, met sjabloon: `Jarvis/Naslag/Een instructie die een fout tegenhoudt.md`

Een Stop-hook houdt de sessie eenmalig tegen als het lessendagboek rood staat.
