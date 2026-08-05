-- ============================================================
-- Villa Happ — voorraadmutaties met spoor
--
-- De voorraad werd tot nu toe alleen door het afrekenen bijgesteld
-- (reserveren, verkopen, vrijgeven). Er was geen manier om zelf iets te
-- corrigeren, en geen manier om achteraf te zien waar een verschil vandaan
-- kwam. Een telling die niet klopt was daarmee niet te herleiden.
--
-- Deze tabel legt elke handmatige bijstelling vast. De voorraadstand zelf
-- blijft in `inventory` staan; dit is het logboek ernaast.
-- ============================================================

CREATE TABLE IF NOT EXISTS voorraad_mutaties (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variant_id  UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  -- Het verschil, niet de nieuwe stand. Positief is bijboeken, negatief
  -- afboeken. Bewust geen absolute waarde: zie de toelichting in
  -- src/lib/voorraad.ts.
  verschil    INT NOT NULL CHECK (verschil <> 0),
  -- Stand na de mutatie, zodat het logboek los van `inventory` te lezen is.
  stand_na    INT NOT NULL CHECK (stand_na >= 0),
  reden       TEXT NOT NULL CHECK (length(btrim(reden)) BETWEEN 2 AND 200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voorraad_mutaties_variant
  ON voorraad_mutaties(variant_id, created_at DESC);

ALTER TABLE voorraad_mutaties ENABLE ROW LEVEL SECURITY;
-- Geen policies: alleen de service-role key komt erbij, net als bij orders.

/**
 * Past een mutatie atomair toe en schrijft het logboek.
 *
 * Waarom een functie en niet twee losse queries vanuit de applicatie: tussen
 * "lees de stand" en "schrijf de nieuwe stand" kan een klant afrekenen. Met
 * een absolute waarde overschrijf je die bestelling dan stilletjes. Hier
 * gebeurt het optellen in de database zelf, in één statement, dus dat kan
 * niet.
 *
 * Geeft de nieuwe stand terug, of NULL als de mutatie de voorraad onder nul
 * zou brengen of onder wat al gereserveerd is. Dat laatste is belangrijk:
 * afboeken tot onder het aantal gereserveerde stuks zou betekenen dat je
 * bestellingen niet meer kunt leveren.
 */
CREATE OR REPLACE FUNCTION muteer_voorraad(
  p_variant_id UUID,
  p_verschil   INT,
  p_reden      TEXT
) RETURNS INT
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  nieuwe_stand INT;
BEGIN
  IF p_verschil = 0 THEN
    RETURN NULL;
  END IF;

  UPDATE public.inventory
  SET quantity = quantity + p_verschil,
      updated_at = NOW()
  WHERE variant_id = p_variant_id
    AND quantity + p_verschil >= 0
    AND quantity + p_verschil >= reserved
  RETURNING quantity INTO nieuwe_stand;

  IF nieuwe_stand IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.voorraad_mutaties (variant_id, verschil, stand_na, reden)
  VALUES (p_variant_id, p_verschil, nieuwe_stand, btrim(p_reden));

  RETURN nieuwe_stand;
END;
$$;

REVOKE ALL ON FUNCTION muteer_voorraad(UUID, INT, TEXT) FROM PUBLIC, anon;

/**
 * Geeft reserveringen vrij van bestellingen die zijn blijven hangen.
 *
 * Klikt een klant het betaalscherm weg, dan blijft zijn voorraad gereserveerd
 * tot Mollie meldt dat de betaling is verlopen. Komt die melding niet aan,
 * bijvoorbeeld doordat de webhook een tijd onbereikbaar was, dan blijft die
 * voorraad voorgoed vastzitten. Bij een oplage van 500 stuks zie je dan
 * uitverkocht staan wat gewoon op de plank ligt.
 *
 * Draait vanuit de dagelijkse cron. Alleen orders die nog op `pending` en
 * `open` staan en ouder zijn dan de opgegeven termijn.
 */
CREATE OR REPLACE FUNCTION geef_verlopen_reserveringen_vrij(p_uren INT DEFAULT 24)
RETURNS TABLE (order_id UUID, order_number TEXT, regels INT)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH oud AS (
    SELECT o.id, o.order_number
    FROM public.orders o
    WHERE o.status = 'pending'
      AND o.payment_status = 'open'
      AND o.created_at < NOW() - (p_uren || ' hours')::INTERVAL
    FOR UPDATE SKIP LOCKED
  ),
  vrijgegeven AS (
    UPDATE public.inventory i
    SET reserved = GREATEST(0, i.reserved - oi.quantity),
        updated_at = NOW()
    FROM public.order_items oi
    JOIN oud ON oud.id = oi.order_id
    WHERE i.variant_id = oi.variant_id
    RETURNING oi.order_id AS oid
  ),
  gesloten AS (
    UPDATE public.orders o
    SET status = 'cancelled', payment_status = 'expired', updated_at = NOW()
    FROM oud WHERE o.id = oud.id
    RETURNING o.id, o.order_number
  )
  SELECT g.id, g.order_number, COUNT(v.oid)::INT
  FROM gesloten g
  LEFT JOIN vrijgegeven v ON v.oid = g.id
  GROUP BY g.id, g.order_number;
END;
$$;

REVOKE ALL ON FUNCTION geef_verlopen_reserveringen_vrij(INT) FROM PUBLIC, anon;
