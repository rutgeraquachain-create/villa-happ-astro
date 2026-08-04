-- ============================================================
-- Villa Happ — oprichtingsjaar 1960 wordt 1945
--
-- Het verhaal begon op 10 mei 1945, toen Tony Kuijsters met haar partner
-- Gaillard de winkel Gaillard Kuijsters opende aan de Noordstraat 85 in
-- Tilburg. Babyparadijs kwam er pas midden jaren vijftig bij, ná de dood van
-- Gaillard en de ontmoeting met Noud van Happen. Het jaartal 1960 dat overal
-- op de site stond, sloeg nergens op.
--
-- De code is aangepast, maar seed.sql haalt een bestaande database niet in:
-- elke insert eindigt op ON CONFLICT DO NOTHING. Vandaar deze migratie.
-- Idempotent: draai hem zo vaak je wilt.
-- ============================================================

UPDATE products
SET description = replace(description, 'in 1960 allemaal mee begon', 'in 1945 allemaal mee begon'),
    updated_at = NOW()
WHERE description LIKE '%in 1960 allemaal mee begon%';

-- Vangnet voor losse vermeldingen die later nog in de teksten zouden sluipen.
UPDATE products SET description = replace(description, '1960', '1945'), updated_at = NOW() WHERE description LIKE '%1960%';
UPDATE products SET short_desc  = replace(short_desc,  '1960', '1945'), updated_at = NOW() WHERE short_desc  LIKE '%1960%';
UPDATE products SET note        = replace(note,        '1960', '1945'), updated_at = NOW() WHERE note        LIKE '%1960%';
UPDATE products SET details     = replace(details::text, '1960', '1945')::jsonb, updated_at = NOW() WHERE details::text LIKE '%1960%';
UPDATE drops    SET description = replace(description, '1960', '1945'), updated_at = NOW() WHERE description LIKE '%1960%';
UPDATE drops    SET certificate = replace(certificate, '1960', '1945'), updated_at = NOW() WHERE certificate LIKE '%1960%';
