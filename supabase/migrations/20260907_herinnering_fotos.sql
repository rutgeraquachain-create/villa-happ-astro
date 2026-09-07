-- Foto's bij een herinnering
--
-- De eerste opzet liet de deelnemer zijn foto los mailen naar contact@, met het
-- inzendnummer in het onderwerp. Dat werkt, maar het betekent handwerk per
-- inzending en een koppeling die stukgaat zodra iemand het nummer vergeet.
-- Nu gaat de foto mee in dezelfde inzending.
--
-- WAAROM EEN PRIVATE BUCKET
-- -------------------------
-- Hier komen foto's binnen van mensen die daar niet automatisch toestemming
-- voor gaven: `mag_archief` is een apart vinkje en staat standaard uit. Een
-- publieke bucket zou elke ingestuurde foto op een raadbare URL zetten, ook die
-- van deelnemers die uitdrukkelijk nee zeiden. Het beheerscherm haalt daarom
-- per foto een ondertekende URL op die na een uur verloopt.
--
-- Wordt een foto later echt in het archief gebruikt, dan hoort hij als gewoon
-- bestand in `public/img/` te belanden, met een eigen naam en een bewuste
-- keuze. Niet door deze bucket open te zetten.

ALTER TABLE public.herinneringen
  ADD COLUMN IF NOT EXISTS foto_pad   TEXT,
  ADD COLUMN IF NOT EXISTS foto_type  TEXT,
  ADD COLUMN IF NOT EXISTS foto_bytes INTEGER;

COMMENT ON COLUMN public.herinneringen.foto_pad IS
  'Pad in de private bucket `herinneringen`. NULL = geen foto meegestuurd.';

-- De bucket. `public = false`, dus alleen bereikbaar met de service role of via
-- een ondertekende URL. De limiet van 5 MB is ruim boven wat de browser na het
-- verkleinen oplevert (circa 400 kB) en onder de bovengrens van een
-- serverless-verzoek, zodat een te grote upload een nette melding geeft in
-- plaats van een afgekapte verbinding.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'herinneringen',
  'herinneringen',
  FALSE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = FALSE,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Geen policies op storage.objects voor deze bucket. Zonder policy komt anon en
-- authenticated er niet in; de service role gaat er sowieso langs. Dat is
-- dezelfde stand als de tabellen met persoonsgegevens.

-- De status krijgt nu betekenis, dus leg vast welke waarden bestaan.
COMMENT ON COLUMN public.herinneringen.status IS
  'nieuw = binnengekomen, gelezen = beoordeeld, favoriet = shortlist, winnaar = gekozen, afgewezen = doet niet mee.';
