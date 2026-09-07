-- Herinneringsactie: inzendingen van klanten met een verhaal over Villa Happ
--
-- De deelnemer vult op /herinnering zijn verhaal in en krijgt een inzendnummer
-- terug, waarmee hij zijn foto naar contact@ mailt. Het nummer is dus geen
-- administratief detail maar de enige koppeling tussen de rij hier en de foto
-- in het postvak.
--
-- WAAROM DE TOESTEMMINGEN APARTE KOLOMMEN ZIJN
-- --------------------------------------------
-- Drie vinkjes, drie los te geven toestemmingen, drie kolommen. Ze samenvatten
-- in één veld ("akkoord ja/nee") maakt achteraf niet meer aantoonbaar waarvoor
-- iemand precies toestemming gaf, en dat is nu juist wat de AVG van je vraagt
-- (art. 7 lid 1). Ze zijn ook echt onafhankelijk: iemand mag zijn foto afstaan
-- voor het archief zonder zijn naam erbij, en meedoen zonder de nieuwsbrief.
--
-- `nieuwsbrief` legt alleen vast dát het vakje is aangevinkt. De inschrijving
-- zelf loopt via `newsletter_subscribers` met dubbele opt-in, want dit adres is
-- ingetypt en niet bewezen. Zie src/lib/nieuwsbrief.ts.

CREATE TABLE IF NOT EXISTS public.herinneringen (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nummer        TEXT NOT NULL UNIQUE,
  naam          TEXT NOT NULL,
  email         TEXT NOT NULL,
  herinnering   TEXT NOT NULL,
  -- Mag de ingestuurde foto in het archief op de website?
  mag_archief   BOOLEAN NOT NULL DEFAULT FALSE,
  -- Mag de naam bij het verhaal of de foto worden getoond?
  mag_naam      BOOLEAN NOT NULL DEFAULT FALSE,
  -- Heeft de deelnemer zich óók voor de nieuwsbrief aangemeld?
  nieuwsbrief   BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'nieuw' zolang de foto nog niet binnen is, 'compleet' zodra dat wel zo is,
  -- 'winnaar' voor de gekozen inzending. Met de hand gezet in het beheer.
  status        TEXT NOT NULL DEFAULT 'nieuw',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eén inzending per adres. Anders stuurt iemand tien verhalen in en maakt hij
-- de kans van de rest stuk, en dan wordt een prijsvraag een loterij.
CREATE UNIQUE INDEX IF NOT EXISTS herinneringen_email_key
  ON public.herinneringen (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_herinneringen_binnenkomst
  ON public.herinneringen (created_at DESC);

-- Dicht voor iedereen behalve de service role. Hier staan naam, adres en een
-- persoonlijk verhaal in; dat is precies wat je niet per ongeluk publiek zet.
ALTER TABLE public.herinneringen ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.herinneringen IS
  'Inzendingen voor de herinneringsactie. Foto komt los per mail binnen, gekoppeld op `nummer`.';

-- Teller voor het inzendnummer, in dezelfde vorm als de bestelnummers.
CREATE TABLE IF NOT EXISTS public.herinnering_counters (
  jaar    INT PRIMARY KEY,
  laatste INT NOT NULL DEFAULT 0
);

ALTER TABLE public.herinnering_counters ENABLE ROW LEVEL SECURITY;

-- Zelfde opzet als generate_order_number: de teller loopt op in de database en
-- niet in de applicatie, zodat twee gelijktijdige inzendingen nooit hetzelfde
-- nummer krijgen. `SET search_path = ''` staat er om dezelfde reden als daar.
CREATE OR REPLACE FUNCTION generate_herinnering_nummer() RETURNS TEXT
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  yr  INT := EXTRACT(YEAR FROM NOW());
  seq INT;
BEGIN
  INSERT INTO public.herinnering_counters (jaar, laatste)
  VALUES (yr, 1)
  ON CONFLICT (jaar) DO UPDATE
    SET laatste = public.herinnering_counters.laatste + 1
  RETURNING laatste INTO seq;

  RETURN 'HH-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION generate_herinnering_nummer() FROM PUBLIC, anon;
