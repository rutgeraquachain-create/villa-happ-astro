# Migratie naar villahapp.nl

Stappenplan om de site te verhuizen naar `villahapp.nl`, met `villa-happ.nl`
als permanente doorverwijzing. Werk het van boven naar beneden af.

**Uitgangspunt: mail vóór site.** Een verkeerde redirect draai je in vijf
minuten terug. Verloren mail komt niet terug.

## Gekozen opzet

DNS voor **beide** domeinen blijft bij Strato. Er komt dus geen
nameserverwissel en geen Vercel DNS-zone. Dat scheelt drie dingen:

- Records hoeven maar één keer ingevoerd te worden
- Microsoft 365 kan verifiëren zodra de verhuizing rond is, zonder te wachten
  op een nameserverwissel
- DNSSEC mag gewoon aan blijven. Vercel DNS ondersteunt het niet; Strato wel,
  en met de zone daar is er geen moment waarop de handtekening niet klopt

Het apex-A-record zet je zelf. Bij Strato zit dat niet in de recordlijst maar
onder **DNS-beheer → A-record → Bestemming → eigen IP-adres**.

## Beginstand

| | |
|---|---|
| `villahapp.nl` | verhuizing naar Strato aangevraagd; nameservers nog `ns4/ns5.nameshift.com` |
| | DNSSEC is bij de transfer opgeruimd — geen DS-record meer bij SIDN |
| `villa-happ.nl` | Strato, live op Vercel, mail Microsoft 365, Resend geverifieerd |
| Vercel-project | `villa-happ-astro`, team `villa-happ-project` |
| M365 | beheerd door een externe partij — plan hun handelingen vooruit |

---

## Stap 1 — Verhuizing naar Strato ⏳ loopt

Aangevraagd. Controleren of hij binnen is:

```bash
nslookup -type=NS villahapp.nl 8.8.8.8
```

Staat daar `*.rzone.de` in plaats van `*.nameshift.com`, dan beheer je de DNS
en kun je verder. Een `.nl`-transfer duurt meestal minder dan een dag.

---

## Stap 2 — Domeinen in Vercel ✅ gedaan

| Domein | Instelling |
|---|---|
| `villahapp.nl` | Production, geen redirect |
| `www.villahapp.nl` | 308 naar `villahapp.nl` |

Beide staan op *Invalid Configuration* tot de DNS wijst. Dat klopt.

**Nog te doen:** klik bij `www.villahapp.nl` op *View DNS configuration* en
noteer de CNAME-waarde — een unieke hostnaam voor dit domein, in de vorm
`<hash>.vercel-dns-017.com`. Die heb je in stap 5 nodig.

---

## Stap 3 — Microsoft 365: domein toevoegen

**Kan nu al**, ook al loopt de verhuizing nog. Toevoegen en verifiëren zijn
losse handelingen: toevoegen vereist geen DNS.

Vraag je IT-partij:

> Kunnen jullie `villahapp.nl` toevoegen als domein in ons Microsoft
> 365-tenant en mij de verificatiewaarde (`MS=...`) en de MX-host doorgeven?
> Verifiëren kan pas als de domeinverhuizing rond is; dat meld ik.
>
> Daarna willen we `rutger@villahapp.nl` en `contact@villahapp.nl` als
> **alias** op het bestaande postvak, met `@villahapp.nl` als primair adres.
> De adressen op `@villa-happ.nl` blijven als alias bestaan — die mogen er
> niet af.

Die laatste alinea is het belangrijkst. Denkt de beheerder dat er een nieuw
postvak moet komen, of dat het oude domein eruit mag, dan krijg je iets
anders dan je wilt.

### Waarom aliassen en geen doorstuurregels

Eén postvak met vier adressen:

| Adres | Rol |
|---|---|
| `rutger@villahapp.nl` | primair — hiermee verstuur je |
| `rutger@villa-happ.nl` | alias |
| `contact@villahapp.nl` | alias |
| `contact@villa-happ.nl` | alias |

Alles komt binnen waar het altijd binnenkwam. Een doorstuurregel breekt SPF
en DMARC, kan lussen maken en faalt stil.

Laat de aanmeldnaam (UPN) met rust. Het primaire mailadres omzetten is
voldoende; de UPN wijzigen betekent op alle apparaten opnieuw inloggen.

---

## Stap 4 — Resend: domein toevoegen

Je DKIM staat op `resend._domainkey.villa-happ.nl` en je SPF op
`send.villa-happ.nl`. Die gelden **niet** voor het nieuwe domein.

Resend → **Domains → Add domain** → `villahapp.nl`. Noteer de DKIM-sleutel;
die gaat in stap 5 de zone in. Verifiëren lukt pas als de records staan.

Sla dit niet over. Zonder deze records bouncen je orderbevestigingen zodra
`MAIL_FROM` op `@villahapp.nl` staat.

---

## Stap 5 — DNS-records bij Strato

Pas als stap 1 rond is. Alles in het Strato-paneel van `villahapp.nl`.

### Het A-record

Niet in de recordlijst, maar onder **DNS-beheer → A-record → Bestemming**.
Kies **eigen IP-adres** en vul in:

```
216.198.79.1
```

Zit die keuze op slot, dan hangt het domein nog aan een pakket. Strato moet
het dan loskoppelen — zelfde verhaal als bij `villa-happ.nl`.

### De overige records

| Type | Naam | Waarde |
|---|---|---|
| `CNAME` | `www` | de waarde uit stap 2 |
| `MX` | *(leeg)* | de M365-host uit stap 3, prioriteit 10 |
| `TXT` | *(leeg)* | `MS=…` uit stap 3 |
| `TXT` | *(leeg)* | `v=spf1 include:spf.protection.outlook.com -all` |
| `TXT` | `_dmarc` | `v=DMARC1; p=none; rua=mailto:contact@villahapp.nl` |
| `CNAME` | `autodiscover` | `autodiscover.outlook.com.` |
| `TXT` | `resend._domainkey` | de sleutel uit stap 4 |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` |

> **Nooit twee SPF-records op dezelfde naam.** Het hoofddomein heeft er
> precies één (Microsoft), `send` precies één (Amazon SES). Een tweede maakt
> beide ongeldig en dan valt ook je gewone mail om.

### Controleren

```bash
nslookup -type=A villahapp.nl 8.8.8.8
```

Staat daar `216.198.79.1`, dan springt Vercel op *Valid Configuration* en
geeft het automatisch SSL-certificaten uit voor beide hostnamen.

Laat daarna M365 en Resend verifiëren; die knoppen slagen nu wel.

---

## Stap 6 — De site omzetten

Pas als `https://villahapp.nl` een geldig certificaat heeft en de site toont.

### Codewijzigingen

| Bestand | Wat |
|---|---|
| `src/lib/business.ts` | `orderEmail`, `supportEmail`, `privacyEmail` → `contact@villahapp.nl` |
| `src/lib/entity.ts` | `domain` → `villahapp.nl` |
| `src/lib/mail.ts` | default `MAIL_FROM` → `Villa Happ <contact@villahapp.nl>` |
| `.env.example`, `astro.config.mjs`, `src/lib/site.ts`, `src/pages/robots.txt.ts` | toelichtingen die het oude domein noemen |

### Environment-variabelen in Vercel

| Variabele | Nieuw |
|---|---|
| `PUBLIC_SITE_URL` | `https://villahapp.nl` — alleen Production |
| `MAIL_FROM` | `Villa Happ <contact@villahapp.nl>` |

### Domeinen in Vercel omzetten

- `villahapp.nl` → **Production**
- `www.villahapp.nl` → 308 naar `villahapp.nl`
- `villa-happ.nl` → **redirect naar `villahapp.nl`**
- `www.villa-happ.nl` → redirect naar `villahapp.nl`

Vercel behoudt het pad, dus `villa-happ.nl/shop` komt uit op
`villahapp.nl/shop`.

### Deploy

Push naar `main` bij `rutgeraquachain-create`. Bij een wijziging van
`PUBLIC_SITE_URL` moet de build **zonder cache**: canonical, sitemap, robots
en llms.txt worden tijdens het bouwen ingebakken.

### Controleren

```bash
curl -sI https://villa-happ.nl/shop
```

Moet doorverwijzen naar `https://villahapp.nl/shop`.

```bash
curl -s https://villahapp.nl/robots.txt
```

Moet `Allow: /` tonen met de sitemap op het nieuwe domein.

De redirects voor de oude ePages-URL's in `vercel.json` blijven werken: die
zijn op pad gebaseerd en gelden op elk domein dat de site serveert.

---

## Stap 7 — Google

1. **Search Console:** nieuwe Domein-property voor `villahapp.nl`,
   verifiëren via DNS-TXT, sitemap indienen op
   `https://villahapp.nl/sitemap.xml`
2. **Adreswijziging** starten vanuit de property van `villa-happ.nl`. Kan pas
   als de redirects live staan, en de oude property moet geverifieerd blijven
   — verwijder hem niet.
3. **GA4:** de URL van de gegevensstroom bijwerken
4. **Google Ads:** de final URLs in je campagnes bijwerken. Ze blijven werken
   via de redirect, maar een extra hop kost kwaliteitsscore.

De GTM-container hoeft niet aangepast: die laadt op elke pagina waar het
script staat, ongeacht het domein.

---

## Wat je daarna nooit moet doen

**`villa-happ.nl` laten verlopen.** Aan dat domein hangen twee dingen:

- De redirects. Vervalt het domein, dan verlies je in één keer alle
  opgebouwde linkwaarde en alle oude advertentielinks.
- De mailaliassen. Klanten met een oude orderbevestiging mailen naar
  `@villa-happ.nl`; die post bounct zodra het domein weg is.

Om diezelfde reden: haal `villa-happ.nl` niet uit Microsoft 365.

Reken op minimaal twee jaar, en eigenlijk gewoon: aanhouden.
