-- ============================================================
-- Villa Happ — Seed: echte catalogus (gespiegeld aan villa-happ.nl)
-- Draai dit NA schema.sql, op een verse database.
-- Idempotent: ON CONFLICT DO NOTHING, dus veilig om opnieuw te draaien.
--
-- Prijzen in cents. status='published' = zichtbaar in de winkel.
-- created_at loopt af zodat de shop-volgorde klopt (olijf -> navy ->
-- cap -> sokken -> 5-pack); de catalogus sorteert op created_at DESC.
-- Pas prijzen/voorraad hier aan als de echte cijfers wijzigen.
-- ============================================================

-- ---------- Drop 001 (voor de /drops-pagina + cap-koppeling) ----------
INSERT INTO drops (slug, title, description, status, total_pieces, certificate, featured)
VALUES (
  'drop-001',
  'Drop 001 · Back-Cap',
  'Het eerste hoofdstuk van de comeback. Een genummerde oplage van 500 back-caps, elk met een uniek code-label en een certificaat van echtheid.',
  'live',
  500,
  'Dit exemplaar is een van de 500 uit Drop 001. Genummerd en gecertificeerd door Villa Happ, Tilburg.',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- PRODUCT 1 — Organic Cotton Hoodie · Olijfgroen
-- ============================================================
INSERT INTO products
  (slug, name, short_desc, description, price_cents, compare_at_cents, category, status, featured,
   image_url, gallery, details, note, badge, created_at)
VALUES (
  'organic-cotton-hoodie-olijfgroen',
  'Organic Cotton Hoodie',
  'Unisex hoodie van biologisch katoen en gerecycled polyester, in olijfgroen.',
  'De Organic Cotton Hoodie is het eerste vaste stuk van de comeback. Gemaakt van biologisch katoen en gerecycled polyester: zacht, stevig en verantwoord. Het Villa Happ embleem is geborduurd, niet geprint, precies zoals op de stukken uit het archief.',
  5995, 6995, 'Olijfgroen · Unisex', 'published', TRUE,
  '/img/products/hoodie-grey-front-v2.webp',
  '["/img/products/hoodie-grey-back-v2.webp","/img/products/hoodie-grey-lifestyle-v2.webp","/img/products/hoodie-logo-detail-v2.webp"]'::jsonb,
  '["Biologisch katoen en gerecycled polyester","Geborduurd Villa Happ embleem","Unisex pasvorm, maat S tot XXL","Ontworpen in Tilburg"]'::jsonb,
  'Biologisch katoen, embleem geborduurd in Tilburg.',
  'Sale',
  '2026-07-10 12:00:05+00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_variants (product_id, sku, size, color, color_hex)
SELECT p.id, v.sku, v.size, 'Olijfgroen', '#6B7A4E'
FROM products p, (VALUES
  ('VH-OCH-OL-S','S'), ('VH-OCH-OL-M','M'), ('VH-OCH-OL-L','L'),
  ('VH-OCH-OL-XL','XL'), ('VH-OCH-OL-XXL','XXL')
) AS v(sku, size)
WHERE p.slug = 'organic-cotton-hoodie-olijfgroen'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory (variant_id, quantity)
SELECT pv.id, q.quantity
FROM product_variants pv, (VALUES
  ('VH-OCH-OL-S',2), ('VH-OCH-OL-M',11), ('VH-OCH-OL-L',9),
  ('VH-OCH-OL-XL',8), ('VH-OCH-OL-XXL',2)
) AS q(sku, quantity)
WHERE pv.sku = q.sku
ON CONFLICT (variant_id) DO NOTHING;

-- ============================================================
-- PRODUCT 2 — Organic Cotton Hoodie · Navy
-- ============================================================
INSERT INTO products
  (slug, name, short_desc, description, price_cents, compare_at_cents, category, status, featured,
   image_url, gallery, details, note, badge, created_at)
VALUES (
  'organic-cotton-hoodie-navy',
  'Organic Cotton Hoodie',
  'Dezelfde hoodie van biologisch katoen, in diep navy.',
  'De Organic Cotton Hoodie in navy: hetzelfde biologische katoen, hetzelfde geborduurde embleem, een kleur die overal bij past. De maten L en XL zijn bijna op, en XXL is al uitverkocht. Als het op is, is het op.',
  5995, 6995, 'Navy · Unisex', 'published', FALSE,
  '/img/products/hoodie-blue-front-v2.webp',
  '["/img/products/hoodie-blue-back.webp"]'::jsonb,
  '["Biologisch katoen en gerecycled polyester","Geborduurd Villa Happ embleem","Unisex pasvorm, maat S tot XXL","Ontworpen in Tilburg"]'::jsonb,
  'Biologisch katoen, embleem geborduurd in Tilburg.',
  'Sale',
  '2026-07-10 12:00:04+00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_variants (product_id, sku, size, color, color_hex)
SELECT p.id, v.sku, v.size, 'Navy', '#2c3a52'
FROM products p, (VALUES
  ('VH-OCH-NV-S','S'), ('VH-OCH-NV-M','M'), ('VH-OCH-NV-L','L'),
  ('VH-OCH-NV-XL','XL'), ('VH-OCH-NV-XXL','XXL')
) AS v(sku, size)
WHERE p.slug = 'organic-cotton-hoodie-navy'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory (variant_id, quantity)
SELECT pv.id, q.quantity
FROM product_variants pv, (VALUES
  ('VH-OCH-NV-S',10), ('VH-OCH-NV-M',12), ('VH-OCH-NV-L',2),
  ('VH-OCH-NV-XL',2), ('VH-OCH-NV-XXL',0)
) AS q(sku, quantity)
WHERE pv.sku = q.sku
ON CONFLICT (variant_id) DO NOTHING;

-- ============================================================
-- PRODUCT 3 — Villa Happ Back-Cap (genummerde oplage 500)
-- ============================================================
INSERT INTO products
  (slug, name, short_desc, description, price_cents, compare_at_cents, category, status, featured,
   image_url, gallery, details, note, edition, badge, drop_id, created_at)
VALUES (
  'villa-happ-back-cap',
  'Villa Happ Back-Cap',
  'Genummerde oplage van 500 stuks, met uniek code-label en certificaat van echtheid.',
  'Het allereerste product van de comeback: de Villa Happ Back-Cap. Een oplage van precies 500 stuks, elk exemplaar met een uniek code-label en een certificaat van echtheid. Drop 001 uit het nieuwe hoofdstuk. Als deze 500 op zijn, komen ze niet terug.',
  2195, 2795, 'Drop 001 · One size', 'published', TRUE,
  '/img/products/back-cap-front-v2.webp',
  '["/img/products/back-cap-side-v2.webp","/img/products/back-cap-angle-v2.webp"]'::jsonb,
  '["Limited edition, oplage 500 stuks","Uniek code-label per exemplaar","Certificaat van echtheid","One size, verstelbaar","Ontworpen in Tilburg"]'::jsonb,
  'Genummerd, een van vijfhonderd. Komt niet terug.',
  500, 'Limited · 500',
  (SELECT id FROM drops WHERE slug = 'drop-001'),
  '2026-07-10 12:00:03+00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_variants (product_id, sku, size, color, color_hex)
SELECT p.id, 'VH-CAP-001', 'One size', 'Grijs melange', '#9a9a9a'
FROM products p
WHERE p.slug = 'villa-happ-back-cap'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory (variant_id, quantity)
SELECT pv.id, 48
FROM product_variants pv
WHERE pv.sku = 'VH-CAP-001'
ON CONFLICT (variant_id) DO NOTHING;

-- ============================================================
-- PRODUCT 4 — Stap voor Stap sokken
-- ============================================================
INSERT INTO products
  (slug, name, short_desc, description, price_cents, category, status, featured,
   image_url, gallery, details, note, created_at)
VALUES (
  'stap-voor-stap-sokken',
  'Stap voor Stap sokken',
  'De sokken waarmee de comeback begon. Want zo gaat dit verhaal verder: stap voor stap.',
  'Stap voor Stap: zo heten de sokken, en zo heet de comeback. Een knipoog naar de eerste stapjes waar het in 1960 allemaal mee begon, en naar de manier waarop dit merk terugkeert. Verkrijgbaar in maat 36/41 en 42/46.',
  895, 'Sokken · 2 maten', 'published', FALSE,
  '/img/brand/villa-happ-logo.webp',
  '[]'::jsonb,
  '["Verkrijgbaar in 36/41 en 42/46","Villa Happ embleem ingebreid","Ook als 5-pack verkrijgbaar","Ontworpen in Tilburg"]'::jsonb,
  'De sokken waarmee de comeback begon.',
  '2026-07-10 12:00:02+00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_variants (product_id, sku, size, color)
SELECT p.id, v.sku, v.size, 'Villa Happ'
FROM products p, (VALUES
  ('VH-SOK-3641','36/41'), ('VH-SOK-4246','42/46')
) AS v(sku, size)
WHERE p.slug = 'stap-voor-stap-sokken'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory (variant_id, quantity)
SELECT pv.id, q.quantity
FROM product_variants pv, (VALUES
  ('VH-SOK-3641',25), ('VH-SOK-4246',25)
) AS q(sku, quantity)
WHERE pv.sku = q.sku
ON CONFLICT (variant_id) DO NOTHING;

-- ============================================================
-- PRODUCT 5 — Stap voor Stap sokken · 5-pack
-- ============================================================
INSERT INTO products
  (slug, name, short_desc, description, price_cents, compare_at_cents, category, status, featured,
   image_url, gallery, details, note, badge, created_at)
VALUES (
  'stap-voor-stap-sokken-5-pack',
  'Stap voor Stap sokken · 5-pack',
  'Vijf paar Stap voor Stap sokken in een voordeelpack.',
  'Voor wie elke dag een stap zet: vijf paar Stap voor Stap sokken in een pack, met voordeel. Verkrijgbaar in maat 36/41 en 42/46.',
  2995, 4475, '5-pack · 2 maten', 'published', FALSE,
  '/img/brand/villa-happ-logo.webp',
  '[]'::jsonb,
  '["Vijf paar per pack","Verkrijgbaar in 36/41 en 42/46","Villa Happ embleem ingebreid","Ontworpen in Tilburg"]'::jsonb,
  'Vijf paar, voor elke stap een nieuwe.',
  'Voordeel',
  '2026-07-10 12:00:01+00'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO product_variants (product_id, sku, size, color)
SELECT p.id, v.sku, v.size, 'Villa Happ'
FROM products p, (VALUES
  ('VH-SOK5-3641','36/41'), ('VH-SOK5-4246','42/46')
) AS v(sku, size)
WHERE p.slug = 'stap-voor-stap-sokken-5-pack'
ON CONFLICT (sku) DO NOTHING;

INSERT INTO inventory (variant_id, quantity)
SELECT pv.id, q.quantity
FROM product_variants pv, (VALUES
  ('VH-SOK5-3641',18), ('VH-SOK5-4246',18)
) AS q(sku, quantity)
WHERE pv.sku = q.sku
ON CONFLICT (variant_id) DO NOTHING;

-- ============================================================
-- Klaar. Controle:
--   SELECT slug, price_cents, status FROM products ORDER BY created_at DESC;
--   SELECT sku, size, color FROM product_variants ORDER BY sku;
--   SELECT pv.sku, i.quantity FROM inventory i JOIN product_variants pv ON pv.id = i.variant_id ORDER BY pv.sku;
-- ============================================================
