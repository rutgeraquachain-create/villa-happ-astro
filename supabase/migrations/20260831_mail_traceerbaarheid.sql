-- Aflevering van transactiemail traceerbaar maken
--
-- AANLEIDING. Bestelling VH-2026-00001 van 25 augustus 2026. De winkeliersmail
-- naar contact@villahapp.nl stond in `uitgaande_mail` op status 'verzonden',
-- met nul pogingen en geen fout. Rutger kreeg hem nooit te zien. Er is zes
-- dagen in de verkeerde richting gezocht, omdat 'verzonden' iets anders
-- betekent dan iedereen aannam.
--
-- `status` beschrijft de WACHTRIJ: is de mail de deur uit gegaan. Hij gaat op
-- 'verzonden' zodra Resend de POST met 200 beantwoordt. Wat daarna gebeurt,
-- aflevering, vertraging, bounce of spamklacht, kwam nergens terug. Het systeem
-- kon "aangenomen" niet van "afgeleverd" onderscheiden en meldde het gunstigste.
--
-- Daarom een TWEEDE as. `status` blijft precies wat hij was, want
-- claim_outbox_batch() draait erop en die machine hoort niet te veranderen.
-- `aflevering` komt ernaast en wordt uitsluitend door de Resend-webhook gevuld.

-- ---------------------------------------------------------------- koppeling
-- Zonder de id die Resend teruggeeft is een webhook-gebeurtenis niet aan een
-- rij te koppelen. Je zou moeten raden op ontvanger plus tijdstip, en dat gokt
-- zodra dezelfde ontvanger twee mails vlak na elkaar krijgt. verstuurDirect()
-- gooide dat antwoord weg; vanaf nu wordt het bewaard.
ALTER TABLE public.uitgaande_mail
  ADD COLUMN IF NOT EXISTS provider_id       TEXT,
  ADD COLUMN IF NOT EXISTS aflevering        TEXT NOT NULL DEFAULT 'onbekend',
  ADD COLUMN IF NOT EXISTS aflevering_op     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aflevering_detail TEXT;

COMMENT ON COLUMN public.uitgaande_mail.provider_id IS
  'Id van Resend, de koppelsleutel voor webhook-gebeurtenissen.';
COMMENT ON COLUMN public.uitgaande_mail.aflevering IS
  'onbekend | verstuurd | vertraagd | afgeleverd | gebounced | spamklacht. Gevuld door de webhook, niet door de wachtrij.';

-- De webhook zoekt hierop, bij elke binnenkomende gebeurtenis.
CREATE INDEX IF NOT EXISTS uitgaande_mail_provider_id_idx
  ON public.uitgaande_mail (provider_id);

-- Voor het beheerscherm: welke mail is niet goed terechtgekomen.
CREATE INDEX IF NOT EXISTS uitgaande_mail_aflevering_idx
  ON public.uitgaande_mail (aflevering)
  WHERE aflevering IN ('gebounced', 'spamklacht', 'vertraagd');

-- ------------------------------------------------------------ gebeurtenissen
-- Append-only. De afgeleide stand staat hierboven op `uitgaande_mail`, maar die
-- overschrijft zichzelf. Wil je achteraf reconstrueren wat er wanneer gebeurde,
-- dan heb je de losse gebeurtenissen nodig. Dat is precies wat er bij VH-2026-00001
-- ontbrak.
--
-- `payload` bewaart het hele bericht van Resend. Bij een bounce staat daar de
-- reden van de ontvangende server in, en die tekst is het enige dat vertelt of
-- het adres niet bestaat of dat de mail geweigerd werd.
CREATE TABLE IF NOT EXISTS public.mail_gebeurtenissen (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Mag leeg zijn: een gebeurtenis over mail die niet uit deze wachtrij komt
  -- (een handmatige verzending vanuit het Resend-dashboard) leggen we ook vast
  -- in plaats van hem weg te gooien.
  mail_id      UUID REFERENCES public.uitgaande_mail (id) ON DELETE SET NULL,
  provider_id  TEXT,
  soort        TEXT NOT NULL,
  ontvanger    TEXT,
  detail       TEXT,
  payload      JSONB,
  -- Svix levert bij elke aflevering een unieke id mee en probeert het opnieuw
  -- als wij geen 2xx geven. Zonder deze unieke sleutel staat dezelfde
  -- gebeurtenis er na een herhaling twee keer in.
  svix_id      TEXT UNIQUE,
  ontvangen_op TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mail_gebeurtenissen_mail_idx
  ON public.mail_gebeurtenissen (mail_id, ontvangen_op DESC);
CREATE INDEX IF NOT EXISTS mail_gebeurtenissen_provider_idx
  ON public.mail_gebeurtenissen (provider_id);

COMMENT ON TABLE public.mail_gebeurtenissen IS
  'Append-only logboek van Resend-webhookgebeurtenissen. Nooit bijwerken, alleen toevoegen.';

-- Server-only, net als orders en uitgaande_mail: RLS aan zonder publieke
-- policy, zodat alleen de service-role erbij kan.
ALTER TABLE public.mail_gebeurtenissen ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------- achterstand
-- Uitgebreid met de aflevering. Het beheerscherm meldde tot nu toe alleen wat
-- er nog in de wachtrij stond; een mail die de deur uit ging en daarna bounced
-- was daar onzichtbaar.
--
-- LET OP: `SET search_path TO ''` en de `public.`-prefixen staan er omdat de
-- LIVE functie ze draagt. Die hardening is destijds op de database toegepast en
-- niet in een migratiebestand teruggeschreven. Vervang je deze functie zonder
-- die twee, dan draai je de beveiliging stilletjes terug, zonder foutmelding en
-- zonder rode test. Gecontroleerd met pg_get_functiondef() op 31 augustus 2026.
DROP FUNCTION IF EXISTS public.outbox_achterstand();

CREATE FUNCTION public.outbox_achterstand()
RETURNS TABLE(wachtend INTEGER, oudste_seconden INTEGER, opgegeven INTEGER, niet_afgeleverd INTEGER)
LANGUAGE sql
SET search_path TO ''
AS $function$
  SELECT
    COUNT(*) FILTER (WHERE status = 'wacht')::INT,
    COALESCE(MAX(EXTRACT(EPOCH FROM NOW() - volgende_poging_op))
             FILTER (WHERE status = 'wacht'), 0)::INT,
    COUNT(*) FILTER (WHERE status = 'opgegeven')::INT,
    COUNT(*) FILTER (WHERE aflevering IN ('gebounced', 'spamklacht'))::INT
  FROM public.uitgaande_mail;
$function$;

COMMENT ON FUNCTION public.outbox_achterstand() IS
  'Achterstand van de mailwachtrij plus het aantal mails dat aantoonbaar niet is afgeleverd.';

-- ------------------------------------------------------------- terugwerkend
-- De drie bestaande rijen kregen hun status voordat er iets over aflevering
-- werd bijgehouden. Ze op 'onbekend' laten staan is eerlijk: we weten van die
-- van 25 augustus inmiddels uit het Resend-dashboard dat hij is afgeleverd,
-- maar dat staat niet in onze eigen keten en hoort er dus niet als feit in.
