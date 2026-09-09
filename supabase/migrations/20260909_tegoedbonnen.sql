-- Villa Happ — tegoedbonnen
--
-- WAAROM DEZE TABEL ER PAS NU IS
-- De herinneringsactie van oktober 2026 belooft de winnaar een tegoedbon van
-- 75 euro, en de actievoorwaarden staan sinds begin september online: "te
-- besteden in de webshop", een jaar geldig, op het hele assortiment,
-- verzendkosten niet inbegrepen, niet inwisselbaar voor geld. Er was alleen
-- geen enkele plek in de code waar zo'n bon bestond of ingewisseld kon worden.
-- De prijs zou dus falen bij de winnaar, ná de campagne, wanneer er niets meer
-- te herstellen valt.
--
-- DE DRIE TOESTANDEN VAN EEN BON
--   vrij       geclaimd_op IS NULL en ingewisseld_op IS NULL
--   geclaimd   er ligt een bestelling op te wachten die nog niet betaald is
--   ingewisseld de betaling is rond; de bon is op
--
-- Een claim vervalt na dertig minuten. Zonder die vervaltijd zou één afgebroken
-- afrekening de bon voorgoed vastzetten, en dat is precies het soort stille
-- fout waar deze campagne al genoeg van heeft gehad: geen foutmelding, alleen
-- een bon die het niet meer doet.

CREATE TABLE IF NOT EXISTS public.tegoedbonnen (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Hoofdletters, met streepjes, zoals hij in de winnaarsmail staat.
  code           TEXT UNIQUE NOT NULL,
  waarde_cents   INTEGER NOT NULL CHECK (waarde_cents > 0),
  -- Waarvoor deze bon is uitgegeven, voor wie hem later terugleest.
  notitie        TEXT,
  verloopt_op    TIMESTAMPTZ NOT NULL,
  -- De bestelling die hem gebruikt. Blijft staan na inwisseling, als spoor.
  order_id       UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  geclaimd_op    TIMESTAMPTZ,
  ingewisseld_op TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tegoedbonnen_code_idx ON public.tegoedbonnen (code);

-- De korting hangt aan de bestelling, niet alleen aan de bon: een bestelling
-- moet los uit te leggen zijn, ook als de bon later wordt opgeruimd.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS korting_cents  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tegoedbon_code TEXT;

COMMENT ON COLUMN public.orders.korting_cents IS
  'Bedrag dat met een tegoedbon van het subtotaal af ging. Nooit van de verzendkosten.';

ALTER TABLE public.tegoedbonnen ENABLE ROW LEVEL SECURITY;
-- Geen enkele policy: alleen de service-rol komt erbij. Een bezoeker mag een
-- code invoeren bij het afrekenen en verder niets, en zeker niet de lijst met
-- geldige codes uitlezen.
REVOKE ALL ON TABLE public.tegoedbonnen FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Claimen, atomair.
--
-- Twee mensen die tegelijk dezelfde code invoeren mogen niet allebei korting
-- krijgen. Deze functie is de enige weg naar een claim, en de UPDATE beslist:
-- wie het eerst is krijgt de rij terug, de ander krijgt niets.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_tegoedbon(p_code TEXT, p_order UUID)
RETURNS SETOF public.tegoedbonnen
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.tegoedbonnen
     SET geclaimd_op = NOW(), order_id = p_order
   WHERE code = UPPER(TRIM(p_code))
     AND ingewisseld_op IS NULL
     AND verloopt_op > NOW()
     AND (geclaimd_op IS NULL OR geclaimd_op < NOW() - INTERVAL '30 minutes')
  RETURNING *;
$$;

-- De claim definitief maken. Aangeroepen door de Mollie-webhook zodra betaald.
CREATE OR REPLACE FUNCTION wissel_tegoedbon_in(p_order UUID)
RETURNS SETOF public.tegoedbonnen
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.tegoedbonnen
     SET ingewisseld_op = NOW()
   WHERE order_id = p_order AND ingewisseld_op IS NULL
  RETURNING *;
$$;

-- De claim teruggeven. Aangeroepen als de betaling niet doorgaat, net zoals de
-- gereserveerde voorraad dan wordt vrijgegeven.
CREATE OR REPLACE FUNCTION geef_tegoedbon_vrij(p_order UUID)
RETURNS SETOF public.tegoedbonnen
LANGUAGE sql SET search_path = '' AS $$
  UPDATE public.tegoedbonnen
     SET geclaimd_op = NULL, order_id = NULL
   WHERE order_id = p_order AND ingewisseld_op IS NULL
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION claim_tegoedbon(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wissel_tegoedbon_in(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION geef_tegoedbon_vrij(UUID) FROM PUBLIC, anon, authenticated;
