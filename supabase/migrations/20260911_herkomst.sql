-- Villa Happ — herkomst op de rij
--
-- Tot 11 september 2026 legde geen enkele tabel vast via welk kanaal een
-- bestelling, aanmelding of herinnering binnenkwam. De vraag "wat leverde de
-- LinkedIn-post op" was daardoor niet te beantwoorden, en herkomst is achteraf
-- niet terug te halen: elke rij van vóór deze migratie blijft onbekend.
--
-- Twee kolommen per tabel, en dat onderscheid is bewust:
--   herkomst         de opgeschoonde signalen (utm-velden, host van de
--                    verwijzer, klik-id, ingangspad) plus de versie van de
--                    classificatieregels waarmee het kanaal werd bepaald
--   herkomst_kanaal  het uitgerekende kanaal, zodat een rapport een simpele
--                    GROUP BY is en niet elke keer de regels opnieuw draait
--
-- Het kanaal ligt vast op het moment van schrijven. Verandert de classificatie
-- later, dan draagt `herkomst->>'versie'` welke regel deze rij indeelde, en is
-- een tabel met rijen van twee versies te herkennen in plaats van stil gemengd.
--
-- NULL betekent: deze rij is van vóór de meting. Dat is iets anders dan
-- 'DIRECT' of 'ONBEKEND', die allebei een gemeten uitkomst zijn.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS herkomst        JSONB,
  ADD COLUMN IF NOT EXISTS herkomst_kanaal TEXT;

ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS herkomst        JSONB,
  ADD COLUMN IF NOT EXISTS herkomst_kanaal TEXT;

ALTER TABLE public.herinneringen
  ADD COLUMN IF NOT EXISTS herkomst        JSONB,
  ADD COLUMN IF NOT EXISTS herkomst_kanaal TEXT;

COMMENT ON COLUMN public.orders.herkomst_kanaal IS
  'Kanaal bij binnenkomst (src/lib/herkomst.ts). NULL = van vóór 11 sep 2026, niet gemeten.';
COMMENT ON COLUMN public.newsletter_subscribers.herkomst_kanaal IS
  'Kanaal van de EERSTE aanmelding; latere aanmeldingen overschrijven dit niet. NULL = niet gemeten.';
COMMENT ON COLUMN public.herinneringen.herkomst_kanaal IS
  'Kanaal bij binnenkomst (src/lib/herkomst.ts). NULL = van vóór 11 sep 2026, niet gemeten.';
