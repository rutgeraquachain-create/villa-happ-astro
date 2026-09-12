-- Villa Happ — de tegoedbon kon twee keer gebruikt worden
--
-- GEMETEN 12 SEPTEMBER 2026, DOOR DE CODE TE LEZEN NA EEN ONAFHANKELIJKE RONDE.
--
-- Het oude `claim_tegoedbon` gaf de bon opnieuw weg zodra de vorige claim
-- dertig minuten oud was:
--
--     AND (geclaimd_op IS NULL OR geclaimd_op < NOW() - INTERVAL '30 minutes')
--
-- Die regel stond er tegen vastlopers: zonder hem zet één afgebroken afrekening
-- de bon voorgoed vast. Maar hij kijkt naar de klok en niet naar de bestelling,
-- en dat is het gat. Een bestelling die dertig minuten oud is, is niet dood: de
-- betaallink van Mollie werkt nog, en bij een overboeking dagenlang.
--
-- Het pad, met één bon van 75 euro:
--   1. de winnaar begint af te rekenen. Bon geclaimd voor bestelling A.
--   2. hij laat het scherm staan, komt een uur later terug en begint opnieuw.
--      De claim is dan stil verhuisd naar bestelling B.
--   3. hij betaalt B. De webhook roept `wissel_tegoedbon_in(B)` aan, die matcht,
--      en de bon staat op ingewisseld.
--   4. hij betaalt daarna alsnog de oude link van A. De webhook roept
--      `wissel_tegoedbon_in(A)` aan. Die matcht op niets, geeft nul rijen terug
--      en geen fout, en de aanroepende code keek alleen naar de fout.
--
-- Twee bestellingen, elk 75 euro korting, van één bon. Geen foutmelding, geen
-- rode toets, niets in het beheerscherm.
--
-- DE OPLOSSING: KIJK NAAR DE BESTELLING, NIET NAAR DE KLOK.
-- Een claim gaat pas over als de vorige bestelling geannuleerd is. Dat is een
-- feit en geen vermoeden, en het gebeurt vanzelf: de Mollie-webhook annuleert
-- een verlopen of afgebroken betaling binnen minuten, en de kwartiercron sluit
-- na 24 uur alles wat nooit terugmeldde (`geef_verlopen_reserveringen_vrij`).
-- De vastloper waar de dertig minuten voor stonden, kan dus nog steeds niet
-- ontstaan; hij duurt alleen zo lang als het duurt om zeker te weten dat de
-- vorige bestelling dood is.

CREATE OR REPLACE FUNCTION claim_tegoedbon(p_code TEXT, p_order UUID)
RETURNS SETOF public.tegoedbonnen
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.tegoedbonnen t
     SET geclaimd_op = NOW(), order_id = p_order
   WHERE t.code = UPPER(TRIM(p_code))
     AND t.ingewisseld_op IS NULL
     AND t.verloopt_op > NOW()
     AND (
       -- Nog nooit geclaimd.
       t.geclaimd_op IS NULL
       -- Of vrijgegeven zonder dat de claimdatum gewist werd.
       OR t.order_id IS NULL
       -- Of de bestelling die hem vasthoudt is definitief niet doorgegaan.
       OR EXISTS (
         SELECT 1 FROM public.orders o
          WHERE o.id = t.order_id
            AND o.status = 'cancelled'
       )
       -- Of de bestelling bestaat niet meer (ON DELETE SET NULL heeft dan al
       -- gewerkt, maar dit dekt het geval dat de rij handmatig weg is).
       OR NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = t.order_id)
     )
  RETURNING t.*;
$$;

COMMENT ON FUNCTION claim_tegoedbon(TEXT, UUID) IS
  'Claimt een bon voor één bestelling. Een claim gaat pas over als de vorige '
  'bestelling geannuleerd is, nooit op basis van verstreken tijd: een oude '
  'bestelling kan nog betaald worden en dan is de bon twee keer gebruikt.';

-- De vrijgave hoort ook naar de bestelling te kijken. Stond de bon al op naam
-- van een andere bestelling, dan mag een late webhook van de oude bestelling
-- hem niet onder de nieuwe vandaan trekken. Dat deed hij goed
-- (`WHERE order_id = p_order`) en dat blijft zo; deze hercreatie staat er
-- alleen zodat de drie functies bij elkaar in één bestand terug te lezen zijn.
CREATE OR REPLACE FUNCTION geef_tegoedbon_vrij(p_order UUID)
RETURNS SETOF public.tegoedbonnen
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.tegoedbonnen
     SET geclaimd_op = NULL, order_id = NULL
   WHERE order_id = p_order AND ingewisseld_op IS NULL
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION claim_tegoedbon(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION geef_tegoedbon_vrij(UUID) FROM PUBLIC, anon, authenticated;
