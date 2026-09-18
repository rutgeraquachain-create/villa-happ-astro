-- ============================================================
-- Villa Happ — VANN-foto's op de warme Villa Happ-achtergrond
--
-- De packshots van VANN stonden op wit, de eigen collectie op warm crème.
-- Nieuwe beelden, gemaakt met scripts/merkfoto-achtergrond.py, onder een
-- nieuwe naam (-v2): /img staat een jaar immutable in de cache, dus een beeld
-- vervang je nooit op hetzelfde pad. De oude paden hebben een 301 in
-- vercel.json.
--
-- VOLGORDE. Draai dit pas bij de merge van de code met de -v2-bestanden. Eerder
-- wijst de database naar bestanden die live nog niet bestaan. Een build tussen
-- de merge en deze migratie is wel veilig: die toont de oude paden, en de 301
-- stuurt ze door naar de nieuwe bestanden.
--
-- Idempotent: paden die al op -v2.webp eindigen, blijven ongemoeid.
-- ============================================================

UPDATE products
SET image_url = replace(image_url, '.webp', '-v2.webp'),
    updated_at = NOW()
WHERE slug = 'vann-ultimate-bottle-650'
  AND image_url NOT LIKE '%-v2.webp';

UPDATE products
SET gallery = (
      SELECT jsonb_agg(
        CASE WHEN g LIKE '%-v2.webp' THEN to_jsonb(g) ELSE to_jsonb(replace(g, '.webp', '-v2.webp')) END
        ORDER BY i)
      FROM jsonb_array_elements_text(gallery) WITH ORDINALITY AS t(g, i)
    ),
    updated_at = NOW()
WHERE slug = 'vann-ultimate-bottle-650';

UPDATE product_variants
SET image_url = replace(image_url, '.webp', '-v2.webp')
WHERE sku LIKE 'VH-VANN-650-%'
  AND image_url NOT LIKE '%-v2.webp';

-- Ter controle, zelfde waarden als src/lib/demo-products.ts:
--   /img/products/vann-ultimate-650-black-v2.webp
--   /img/products/vann-ultimate-650-highland-green-v2.webp
--   /img/products/vann-ultimate-650-bay-blue-v2.webp
--   /img/products/vann-ultimate-650-oatmeal-v2.webp
--   /img/products/vann-ultimate-650-coral-v2.webp
--   /img/products/vann-ultimate-650-himalayan-salt-v2.webp
