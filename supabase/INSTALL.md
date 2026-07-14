# Villa Happ — Supabase installeren

Van demo-modus naar een echte database. Zolang de keys ontbreken draait de
site bewust op de demo-catalogus (`src/lib/supabase.ts` valt terug). Zodra de
drie keys staan, leest de site uit Supabase.

## 1. Project aanmaken (doe jij, eenmalig)

1. Maak een account of log in op https://supabase.com.
2. **New project**: naam `villa-happ`, sterk databasewachtwoord (bewaren),
   regio **EU (Frankfurt)** (dichtbij, AVG-vriendelijk).
3. Wacht tot het project klaar is (ongeveer 2 minuten).

## 2. Schema + seed draaien

In het Supabase-dashboard, links **SQL Editor**, dan **New query**:

1. Plak de volledige inhoud van [`schema.sql`](./schema.sql) en klik **Run**.
   Dit maakt alle tabellen, indexen, RLS-policies en de voorraad-functies aan.
   (De migraties in `migrations/` zijn de losse historie voor een bestaande
   database; op een verse database heb je ze niet nodig, `schema.sql` bevat
   alles.)
2. Nieuwe query, plak [`seed.sql`](./seed.sql), klik **Run**.
   Dit zet de echte catalogus erin (2 hoodies, cap, sokken, 5-pack) met
   varianten en voorraad. Pas prijzen of voorraad in `seed.sql` aan als de
   echte cijfers wijzigen, en draai opnieuw (idempotent).

Controle (nieuwe query):
```sql
select slug, price_cents, status from products order by created_at desc;
```
Je hoort 5 rijen te zien, olijfgroen bovenaan.

## 3. Keys ophalen en lokaal zetten

Dashboard, **Project Settings, API**. Zet in `Astro_Website/.env`
(dit bestand staat in `.gitignore`, dus veilig; de sleutels blijven lokaal):

```
PUBLIC_SUPABASE_URL=https://<jouwproject>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon public key>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>   # server-only, nooit in code
```

Herstart de dev-server. De shop leest nu uit Supabase in plaats van de demo.

## 4. Keys in Vercel (voor de live site)

Vercel-project (`villa-happ-astro`), **Settings, Environment Variables**.
Voeg dezelfde drie toe, plus bij go-live:

```
MOLLIE_API_KEY=test_...        # test_ om te testen, live_ bij go-live
PUBLIC_SITE_URL=https://villa-happ.nl   # pas bij go-live; op *.vercel.app blijft noindex
```

Optioneel (mail + beheer):
```
RESEND_API_KEY=re_...          # zonder key wordt bewust geen mail verstuurd
CRON_SECRET=...                # beveiligt de back-in-stock-verzender
ADMIN_API_SECRET=...           # beveiligt de verzendbevestiging
```

Redeploy zodat de env-vars actief worden.

## 5. Verifiëren (end-to-end)

- Shop toont de databaseproducten (niet de demo); voorraad en prijzen kloppen.
- Een variant op 0 toont uitverkocht; back-in-stock-melding schrijft weg in
  `back_in_stock`.
- Een testbestelling met de Mollie-**test**-key doorloopt checkout, reserveert
  voorraad (`reserve_inventory`), en de webhook zet de order op betaald
  (`finalize_inventory`), idempotent.
- Een review indienen landt in `product_reviews` met `approved=false`
  (moderatie), pas zichtbaar na goedkeuring.
- Het Atelier: claim-je-nummer schrijft echt weg in `atelier_claims` (nu geen
  503-terugval meer op een lokaal nummer).

## Let op

- **Fail-loud:** met geconfigureerde maar falende keys breekt de build bewust
  (`catalog.ts`), zodat er nooit stil demo-data live gaat.
- **Volgorde:** `schema.sql` maakt `drops` vóór `products` aan, want
  `products.drop_id` verwijst ernaar.
- **Demo-producten in checkout:** varianten met een id dat met `demo-` begint
  tonen een demomelding in plaats van een echte Mollie-betaling. Uit Supabase
  hebben varianten echte UUID's, dus daar start Mollie wel.
