-- Bevestigde toestemming voor de nieuwsbrief
--
-- Aanleiding: op 1 september 2026 stonden er vier inschrijvingen in de tabel,
-- alle vier met `confirmed = false`. Die kolom bestond wel maar werd nergens op
-- true gezet: de aanmeldroute schreef het adres weg en meldde "Bedankt voor je
-- inschrijving", zonder bevestigingsstap en zonder uitschrijfmogelijkheid.
--
-- Daarmee kon er niets verstuurd worden. De AVG vraagt om aantoonbare
-- toestemming (art. 7 lid 1), en een formulierinzending zonder bevestiging is
-- zwak bewijs: iedereen kan andermans adres invullen. Een commerciële mailing
-- moet daarnaast een uitschrijfmogelijkheid bevatten (art. 11.7 Telecomwet).
--
-- `confirmed_at` legt het moment van bevestiging vast. Dat is het bewijsstuk:
-- niet dát iemand bevestigde, maar wanneer. Bewust geen IP-adres erbij; dat is
-- persoonsgegeven dat we voor dit doel niet nodig hebben.

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.newsletter_subscribers.confirmed_at IS
  'Moment waarop de dubbele opt-in is bevestigd. Bewijs van toestemming; NULL betekent nooit bevestigd en dus niet aanschrijfbaar.';

COMMENT ON COLUMN public.newsletter_subscribers.unsubscribed_at IS
  'Moment van uitschrijven. Gevuld betekent: nooit meer aanschrijven, ook niet na een nieuwe aanmelding zonder bevestiging.';

-- De verzendlijst is altijd dezelfde selectie. Als index, zodat een mailing
-- niet de hele tabel hoeft te lezen, en als vaste definitie zodat niemand hem
-- per ongeluk anders formuleert.
CREATE INDEX IF NOT EXISTS idx_nieuwsbrief_verzendlijst
  ON public.newsletter_subscribers (created_at)
  WHERE confirmed IS TRUE AND unsubscribed_at IS NULL;

-- De vier bestaande adressen blijven staan en blijven onbevestigd. Ze krijgen
-- eenmalig een bevestigingsverzoek; dat is geen reclame maar een vraag om de
-- inschrijving af te maken die ze zelf startten. Reageren ze niet, dan blijven
-- ze buiten elke verzending.
