-- ============================================================
-- Villa Happ — vaste prijzen zonder korting
--
-- Bij het weghalen van de kortingen is de verkeerde kant gekozen: de
-- áfgeprijsde waarde bleef staan als vaste prijs, terwijl juist de reguliere
-- prijs moest blijven. De hoodie stond daardoor op 59,95 in plaats van rond
-- de 70, en de cap op 21,95.
--
-- Dit zijn de vastgestelde prijzen. Geen compare_at meer, dus geen
-- doorgestreepte bedragen en geen kortingsbadges.
--
-- seed.sql haalt een bestaande database niet in: elke insert eindigt op
-- ON CONFLICT DO NOTHING. Vandaar deze migratie. Idempotent.
-- ============================================================

UPDATE products SET price_cents = 7495, compare_at_cents = NULL, updated_at = NOW()
WHERE slug IN ('organic-cotton-hoodie-navy', 'organic-cotton-hoodie-olijfgroen');

UPDATE products SET price_cents = 2795, compare_at_cents = NULL, updated_at = NOW()
WHERE slug = 'villa-happ-back-cap';

UPDATE products SET price_cents = 895, compare_at_cents = NULL, updated_at = NOW()
WHERE slug = 'stap-voor-stap-sokken';

UPDATE products SET price_cents = 3995, compare_at_cents = NULL, updated_at = NOW()
WHERE slug = 'stap-voor-stap-sokken-5-pack';
