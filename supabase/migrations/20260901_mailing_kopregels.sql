-- Kopregels per mail in de outbox
--
-- Een mailing draagt `List-Unsubscribe` en `List-Unsubscribe-Post` (RFC 8058).
-- Gmail en Outlook tonen op basis daarvan hun eigen uitschrijfknop bovenin het
-- bericht, en bulkverzenders die dat niet doen belanden sneller in de spambak.
--
-- Die kopregel bevat een ondertekend token dat per ontvanger verschilt, dus hij
-- kan niet vast in de verzendcode staan: hij hoort bij de rij.
--
-- Bewust jsonb en geen kolom per kopregel. De outbox weet niets van
-- nieuwsbrieven, en dat moet zo blijven: hij vervoert mail, hij bedenkt niets.

ALTER TABLE public.uitgaande_mail
  ADD COLUMN IF NOT EXISTS kopregels JSONB;

COMMENT ON COLUMN public.uitgaande_mail.kopregels IS
  'Extra e-mailkopregels voor deze ene mail, bijvoorbeeld List-Unsubscribe met een adres-specifiek token. NULL voor gewone transactiemail.';
