-- Villa Happ — de opruimtaak liet reserveringen achter
--
-- GEMETEN 12 SEPTEMBER 2026, TEGEN DE ECHTE FUNCTIE OP DE PRODUCTIEDATABASE.
-- Drie varianten naast elkaar, met 1, 2 en 3 verlopen bestellingen erop, en één
-- aanroep van `geef_verlopen_reserveringen_vrij(24)`:
--
--   verlopen orders | reserved vooraf | verwacht | gemeten | orders gesloten
--   1               | 1               | 0        | 0       | 1
--   2               | 2               | 0        | 1       | 2
--   3               | 3               | 0        | 2       | 3
--
-- De oude query deed dit:
--
--     UPDATE public.inventory i
--        SET reserved = GREATEST(0, i.reserved - oi.quantity)
--       FROM public.order_items oi
--       JOIN oud ON oud.id = oi.order_id
--      WHERE i.variant_id = oi.variant_id
--
-- In PostgreSQL raakt een UPDATE elke doelrij hooguit één keer, ook als er
-- meerdere bronrijen op wijzen. Wijzen drie verlopen orderregels naar dezelfde
-- voorraadrij, dan wordt er één afgetrokken en verdwijnen de andere twee zonder
-- melding. De orders worden in dezelfde query wél allemaal gesloten, dus er is
-- daarna geen open bestelling meer die die reservering kan vrijgeven. Ze staat
-- vast tot iemand hem met de hand weghaalt.
--
-- Het effect stapelt: elke ronde met meerdere verlopen bestellingen op één maat
-- laat er weer een paar achter. De winkel toont dan uitverkocht voor voorraad
-- die op de plank ligt, en omdat de productpagina "al verkocht" afleidt uit de
-- beschikbare voorraad, loopt ook die teller mee op.
--
-- Op het moment van ontdekken stond er nul afwijking in de productievoorraad.
-- De winkel had twee bestellingen gehad. De fout wachtte op drukte.
--
-- DE OPLOSSING: EERST OPTELLEN PER VARIANT, DAN ÉÉN KEER AFTREKKEN.
-- `per_variant` telt de aantallen van alle verlopen orderregels bij elkaar op,
-- zodat er per voorraadrij precies één bronrij overblijft en de UPDATE het hele
-- bedrag verwerkt.

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
  -- Eén rij per variant. Dit is het hele verschil met de oude versie.
  per_variant AS (
    SELECT oi.variant_id, SUM(oi.quantity)::INT AS totaal
    FROM public.order_items oi
    JOIN oud ON oud.id = oi.order_id
    GROUP BY oi.variant_id
  ),
  vrijgegeven AS (
    UPDATE public.inventory i
    SET reserved = GREATEST(0, i.reserved - pv.totaal),
        updated_at = NOW()
    FROM per_variant pv
    WHERE i.variant_id = pv.variant_id
    RETURNING i.variant_id
  ),
  -- Hoeveel regels er bij welke order hoorden, voor de teruggave. Dit stond
  -- eerder in de UPDATE zelf, en juist daardoor telde hij alleen de regels die
  -- de UPDATE toevallig had geraakt.
  regels_per_order AS (
    SELECT oi.order_id AS oid, COUNT(*)::INT AS aantal
    FROM public.order_items oi
    JOIN oud ON oud.id = oi.order_id
    WHERE EXISTS (SELECT 1 FROM vrijgegeven v WHERE v.variant_id = oi.variant_id)
    GROUP BY oi.order_id
  ),
  gesloten AS (
    UPDATE public.orders o
    SET status = 'cancelled', payment_status = 'expired', updated_at = NOW()
    FROM oud WHERE o.id = oud.id
    RETURNING o.id, o.order_number
  )
  SELECT g.id, g.order_number, COALESCE(r.aantal, 0)
  FROM gesloten g
  LEFT JOIN regels_per_order r ON r.oid = g.id;
END;
$$;

COMMENT ON FUNCTION geef_verlopen_reserveringen_vrij(INT) IS
  'Sluit bestellingen die p_uren geen betaling terugmeldden en geeft hun '
  'gereserveerde voorraad vrij. Telt eerst per variant op: een UPDATE raakt '
  'elke doelrij maar een keer, dus zonder die optelling blijft er bij meerdere '
  'verlopen orders op dezelfde maat reservering achter die niemand meer sluit.';

REVOKE ALL ON FUNCTION geef_verlopen_reserveringen_vrij(INT) FROM PUBLIC, anon;
