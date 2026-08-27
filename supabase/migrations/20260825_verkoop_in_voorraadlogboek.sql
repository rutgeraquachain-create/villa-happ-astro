-- Verkopen in het voorraadlogboek
--
-- Aanleiding: de eerste echte bestelling, VH-2026-00001 op 25 augustus 2026.
-- De voorraad ging netjes van 25 naar 24, maar `voorraad_mutaties` bleef leeg.
-- Alleen de handmatige correctie in /beheer/voorraad schreef daarin, via
-- `muteer_voorraad()`. Verkopen lopen via `finalize_inventory()` en lieten geen
-- spoor na.
--
-- Dat is de gevaarlijke variant van een logboek: het suggereert een volledige
-- geschiedenis en bevat alleen correcties. Klopt de voorraad op een dag niet,
-- dan is dit precies het moment waarop je het nodig hebt en staat er niets in.
--
-- De regel wordt in dezelfde functie geschreven als waar de voorraad verandert,
-- niet vanuit de applicatie. Zo kan een verkoop niet doorgaan terwijl de regel
-- wegvalt, en telt het ook mee als iemand de functie ooit rechtstreeks aanroept.

-- LET OP: `SET search_path TO ''` en de `public.`-prefixen zijn geen franje.
-- De live functie draagt ze al, maar het migratiebestand van 20260704 niet:
-- die hardening is later toegevoegd en nooit teruggeschreven naar de repo.
-- Zonder deze regel zou dit bestand die beveiliging stilletjes terugdraaien.
-- Met een lege search_path moet elke tabelnaam gekwalificeerd zijn, anders
-- faalt de functie bij de eerste aanroep.
CREATE OR REPLACE FUNCTION public.finalize_inventory(v_id UUID, qty INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  nieuwe_stand INT;
BEGIN
  IF qty <= 0 THEN RETURN FALSE; END IF;

  UPDATE public.inventory
  SET quantity = GREATEST(0, quantity - qty),
      reserved = GREATEST(0, reserved - qty),
      updated_at = NOW()
  WHERE variant_id = v_id
  RETURNING quantity INTO nieuwe_stand;

  IF nieuwe_stand IS NULL THEN
    RETURN FALSE;
  END IF;

  -- `verschil` is negatief: er gaat voorraad af. Dezelfde conventie als
  -- muteer_voorraad(), zodat een optelling over de hele tabel klopt.
  INSERT INTO public.voorraad_mutaties (variant_id, verschil, stand_na, reden)
  VALUES (v_id, -qty, nieuwe_stand, 'verkoop');

  RETURN TRUE;
END;
$$;

-- Terugbetalen zet voorraad terug. Dat gebeurt vandaag nog met de hand via
-- /beheer/voorraad, en die route logt al. Komt er ooit een automatische
-- retourboeking, geef die dan reden 'retour' zodat verkoop en retour in het
-- logboek uit elkaar te houden blijven.

COMMENT ON FUNCTION public.finalize_inventory(UUID, INT) IS
  'Zet een reservering om in verkoop en schrijft de mutatie in voorraad_mutaties (reden: verkoop).';
