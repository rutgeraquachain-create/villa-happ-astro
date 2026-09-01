# Villa Happ — Astro storefront

Webshop van Villa Happ, een Nederlands heritage lifestylelabel. Het merk
ontstond in 1960 in Tilburg en is vandaag gevestigd in Waalwijk — die twee
plaatsen zijn nadrukkelijk niet inwisselbaar, zie `src/lib/entity.ts`.

Gebouwd met **Astro 6**, **Supabase**, **Mollie** en **Resend**, gehost op
Vercel.

> **Ga je deployen of DNS aanpassen? Lees eerst [`docs/workflow.md`](docs/workflow.md).**
> Daar staat welke repository leidend is, hoe een wijziging live komt, en de
> valkuilen die eerder een dag hebben gekost.

---

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

De site draait dan op `http://localhost:4321`. Zonder Supabase-sleutels valt
de catalogus terug op `src/lib/demo-products.ts`, zodat je zonder database
kunt werken.

## Commands

| Command | Doet |
|---|---|
| `npm run dev` | Dev-server op `localhost:4321` |
| `npm run build` | Productiebuild (hetzelfde als Vercel draait) |
| `npm run preview` | Bekijk de productiebuild lokaal |
| `npm run check` | Astro- en TypeScript-typecheck |
| `npm test` | Unit tests (vitest) |
| `npm run beheer:hash -- 'wachtwoord'` | Genereert `AUTH_SECRET` + `ADMIN_PASSWORD_HASH` |

Vóór elke commit: `npm test` groen en `npm run check` op 0 errors.

## Environment variables

De volledige lijst met wat er stukgaat als ze ontbreken staat in
[`docs/workflow.md`](docs/workflow.md#3-environment-variabelen). Kort:

| Variabele | Nodig | Doel |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | ja | catalogus, orders |
| `PUBLIC_SUPABASE_ANON_KEY` | ja | catalogus |
| `SUPABASE_SERVICE_ROLE_KEY` | ja | orders, voorraad, beheer — server-only |
| `MOLLIE_API_KEY` | ja | betalingen, `test_` of `live_` |
| `PUBLIC_SITE_URL` | ja | canonical, sitemap, robots, Mollie-redirect |
| `AUTH_SECRET` | ja | ondertekent bestel- en beheertokens; zonder deze **geen checkout** |
| `ADMIN_PASSWORD_HASH` | ja | toegang tot `/beheer` |
| `CRON_SECRET` | ja | beveiligt de dagelijkse cron |
| `RESEND_API_KEY` | optioneel | transactiemail; zonder deze wordt er bewust niets verstuurd |
| `MAIL_FROM` | optioneel | afzender, default staat in `src/lib/mail.ts` |
| `RESEND_WEBHOOK_SECRET` | aanbevolen | meldt terug of mail is aangekomen; zonder deze weet je alleen dat Resend hem aannam |
| `MAIL_ALARM_NAAR` | aanbevolen | adres **buiten** `villahapp.nl` dat bericht krijgt bij een bounce |

## Bron van waarheid

Wijzig gegevens op één plek, nooit in een pagina.

| Wat | Bestand |
|---|---|
| KvK, btw, adressen, mailadres, retourtermijnen | `src/lib/business.ts` |
| Verzendtarieven, gratis-verzendgrens | `src/lib/shipping.ts` |
| Juridische formuleringen | `src/lib/legal.ts` |
| Merkfeiten voor schema en `llms.txt` | `src/lib/entity.ts` |
| Domein en indexeerbaarheid | `src/lib/site.ts` |
| Retourberekening | `src/lib/retour.ts` |

## Structuur

```
src/
├── components/
│   ├── commerce/     cart drawer
│   ├── home/         homepage-scenes
│   ├── layout/       header, footer
│   └── legal/        layout voor de juridische pagina's
├── layouts/          Base.astro, BeheerLayout.astro
├── lib/              bron van waarheid + pure logica (zie tabel hierboven)
├── pages/
│   ├── api/          checkout, webhook, contact, beheer, atelier
│   ├── beheer/       orderbeheer achter wachtwoord
│   ├── bestelling/   klantportaal op capability-token
│   ├── shop/         listing + productpagina's
│   └── …             story, atelier, journal, voor-merken, juridisch
└── styles/           tokens, base, home, shop, atelier, beheer
supabase/             schema, seed, migraties
tests/                vitest — checkout, retour, atelier, orderstatus
docs/                 workflow, retourbeleid, Astro 7-migratie
```

## Documentatie

| Document | Waarover |
|---|---|
| [`docs/workflow.md`](docs/workflow.md) | **Deploy, repositories, DNS, env-variabelen, prijzen wijzigen, orderbeheer en openstaande punten.** Begin hier. |
| [`docs/retourbeleid.md`](docs/retourbeleid.md) | Retourregeling en de rekenregel; leidend boven de code |
| [`docs/meetplan.md`](docs/meetplan.md) | Wat we meten in GA4 en Google Ads, en waarop het vuurt |
| [`docs/domeinmigratie.md`](docs/domeinmigratie.md) | Stappenplan voor de overstap naar villahapp.nl |
| [`docs/astro-7-migratie.md`](docs/astro-7-migratie.md) | Waarom Astro 7 is teruggedraaid |

## Licentie

Proprietary — Villa Happ © 2026
