-- Afzender per mail in de outbox
--
-- Sinds 2 september 2026 komt orderpost van `bestellingen@villahapp.nl` en de
-- rest van `contact@`. Welke afzender bij welke mailsoort hoort staat in
-- `afzenderVoor()` in src/lib/mail.ts.
--
-- Waarom de afzender op de rij en niet bij het versturen berekend: een mail kan
-- dagen in de wachtrij staan en tot zes keer opnieuw geprobeerd worden. Zou de
-- afzender per poging opnieuw worden afgeleid, dan verandert hij zodra de regel
-- wijzigt, en verstuur je een herpoging met een andere afzender dan de eerste
-- poging. Voor een ontvanger die beide krijgt is dat verwarrend, en voor het
-- terugzoeken in de afleverwebhook is het lastig.
--
-- Bestaande rijen houden NULL. Die vallen bij het versturen terug op MAIL_FROM,
-- precies het gedrag van vóór deze wijziging.

ALTER TABLE public.uitgaande_mail
  ADD COLUMN IF NOT EXISTS afzender TEXT;

COMMENT ON COLUMN public.uitgaande_mail.afzender IS
  'Van-adres voor deze mail, vastgelegd bij het klaarzetten zodat een herpoging dezelfde afzender houdt. NULL valt terug op MAIL_FROM.';
