-- ============================================================
-- Villa Happ — Goods en VH_APProved-merken
--
-- Naast kleding verkoopt Villa Happ nu ook producten van andere merken,
-- onder de categorie Goods. Het eerste is de Ultimate Bottle van VANN.
--
-- Waarom twee nieuwe kolommen en niet `category` hergebruiken: `category`
-- voert al de metaregel onder een productkaart ("Navy · Unisex",
-- "Drop 001 · One size"). Die ombouwen tot een categorieveld zou elke kaart
-- op de site raken.
--
--   collectie  kleding of goods. Default kleding, dus de bestaande vijf
--              producten veranderen niet.
--   merk       Het merk van de maker, alleen bij een product dat Villa Happ
--              niet zelf maakt. Leeg is eigen collectie. Stuurt het merk in
--              het Product-schema; daar mag bij VANN nooit "Villa Happ" staan.
--   merk_toelichting  Waarom wij het merk goedkeuren (VH_APProved).
--
-- VOLGORDE. De kolommen moeten bestaan vóór de code gemerged wordt, want
-- src/lib/catalog.ts selecteert ze en een mislukte query breekt de build.
-- Het product komt binnen als `draft` met voorraad 0: zo verschijnt het niet
-- op de site tot de code met de beelden live is en de voorraad geteld is.
-- Daarna: voorraad invullen en `status` op `published` zetten, dan opnieuw
-- bouwen.
--
-- Tekst en beelden zijn gelijk aan src/lib/demo-products.ts. Idempotent.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS collectie TEXT NOT NULL DEFAULT 'kleding';
ALTER TABLE products ADD COLUMN IF NOT EXISTS merk TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS merk_toelichting TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_collectie_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_collectie_check
      CHECK (collectie IN ('kleding', 'goods'));
  END IF;
END $$;

INSERT INTO products (
  slug, name, collectie, merk, merk_toelichting, price_cents, currency, status,
  featured, category, short_desc, description, details, note, image_url, gallery
) VALUES (
  'vann-ultimate-bottle-650',
  'VANN Ultimate Bottle 650 ml',
  'goods',
  'VANN',
  'VANN is een Nederlands merk dat sinds 2020 herbruikbare drinkflessen van roestvrij staal maakt. De naam is Noors en betekent water. We nemen het op omdat het past bij hoe wij naar kleding kijken: iets goed maken, zodat je het jaren gebruikt.',
  3490,
  'EUR',
  'draft',
  false,
  'VH_APProved · 6 kleuren',
  'Driewandige drinkfles van roestvrij staal. Houdt je drinken 24 uur koud of 12 uur warm.',
  'De Ultimate Bottle is de drinkfles van VANN. Drie wanden roestvrij staal houden water een hele dag koud en thee twaalf uur warm, en ijsblokjes blijven 24 uur heel. De fles is lekvrij, bevat geen BPA en past in een bekerhouder. Je krijgt er drie doppen bij, zodat je zelf kiest of je uit een rietje, een tuit of de schroefopening drinkt.',
  '["Roestvrij staal, driewandig geïsoleerd", "24 uur koud, 12 uur warm", "650 ml, lekvrij en BPA-vrij", "Met drie doppen, een rietje en een schoonmaakborstel", "Gemaakt door VANN, verstuurd door Villa Happ"]'::jsonb,
  'Van VANN, goedgekeurd door Villa Happ.',
  '/img/products/vann-ultimate-650-black.webp',
  '["/img/products/vann-ultimate-650-highland-green.webp", "/img/products/vann-ultimate-650-bay-blue.webp", "/img/products/vann-ultimate-650-oatmeal.webp", "/img/products/vann-ultimate-650-coral.webp", "/img/products/vann-ultimate-650-himalayan-salt.webp"]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

-- Eén variant per kleur. `size` is overal 650 ml; de klant kiest op kleur.
-- De checkout maakt daar het variantlabel "Black / 650 ml" van.
INSERT INTO product_variants (product_id, sku, size, color, color_hex, image_url)
SELECT p.id, v.sku, '650 ml', v.color, v.hex, v.img
FROM products p
CROSS JOIN (VALUES
  ('VH-VANN-650-BLK', 'Black',          '#24292A', '/img/products/vann-ultimate-650-black.webp',          1),
  ('VH-VANN-650-HGR', 'Highland Green', '#6D875A', '/img/products/vann-ultimate-650-highland-green.webp', 2),
  ('VH-VANN-650-BBL', 'Bay Blue',       '#96B4CA', '/img/products/vann-ultimate-650-bay-blue.webp',       3),
  ('VH-VANN-650-OAT', 'Oatmeal',        '#E7DCC9', '/img/products/vann-ultimate-650-oatmeal.webp',        4),
  ('VH-VANN-650-COR', 'Coral',          '#FDB49B', '/img/products/vann-ultimate-650-coral.webp',          5),
  ('VH-VANN-650-HSA', 'Himalayan Salt', '#ECE2E5', '/img/products/vann-ultimate-650-himalayan-salt.webp', 6)
) AS v(sku, color, hex, img, volgorde)
WHERE p.slug = 'vann-ultimate-bottle-650'
ORDER BY v.volgorde
ON CONFLICT (sku) DO NOTHING;

-- Voorraad op nul. Tellen en invullen gebeurt via /beheer, zodat de mutatie
-- in het voorraadlogboek belandt en niet stil in een migratie.
INSERT INTO inventory (variant_id, quantity, reserved)
SELECT v.id, 0, 0
FROM product_variants v
WHERE v.sku LIKE 'VH-VANN-650-%'
ON CONFLICT (variant_id) DO NOTHING;
