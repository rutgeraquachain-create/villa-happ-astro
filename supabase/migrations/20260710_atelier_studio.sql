-- ============================================================
-- Villa Happ — Het Atelier ontwerpstudio: sla het geconfigureerde
-- stuk mee op bij de claim (kledingstuk, kleur, initialen).
-- Draai dit op een bestaande database; nieuwe databases krijgen de
-- kolommen via schema.sql.
-- ============================================================

ALTER TABLE atelier_claims ADD COLUMN IF NOT EXISTS garment  TEXT;
ALTER TABLE atelier_claims ADD COLUMN IF NOT EXISTS initials TEXT;
