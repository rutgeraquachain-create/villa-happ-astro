-- ============================================================
-- Villa Happ — Supabase / Postgres schema
-- Producten, varianten (size/color), voorraad, orders, drops
-- ============================================================

-- Cleanup (alleen voor dev — remove voor productie)
-- DROP TABLE IF EXISTS order_items, orders, customers, inventory, product_variants, products, drops, newsletter_subscribers CASCADE;

-- Extension voor UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DROPS (limited edition collections)
-- Staat bewust vóór products: products.drop_id verwijst naar drops(id),
-- dus deze tabel moet eerst bestaan op een verse database.
-- ============================================================
CREATE TABLE IF NOT EXISTS drops (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'coming-soon', -- coming-soon | live | sold-out | archived
  launch_date   TIMESTAMPTZ,
  end_date      TIMESTAMPTZ,
  total_pieces  INTEGER,
  certificate   TEXT,                              -- HTML/text certificaat tekst
  featured      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drops_status ON drops(status);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  short_desc    TEXT,
  price_cents   INTEGER NOT NULL DEFAULT 0,    -- alles in cents
  compare_at_cents INTEGER,                     -- voor sale prijzen
  currency      TEXT NOT NULL DEFAULT 'EUR',
  category      TEXT,                            -- bv. 'hoodies', 'caps', 'sokken'
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft | published | archived
  featured      BOOLEAN DEFAULT FALSE,
  image_url     TEXT,                            -- primaire afbeelding
  gallery       JSONB DEFAULT '[]'::jsonb,       -- array van extra image URLs
  details       JSONB DEFAULT '[]'::jsonb,       -- bullet-lijst op de PDP
  note          TEXT,                            -- warm sfeerzinnetje (o.a. mandje)
  edition       INTEGER,                         -- genummerde oplage (voedt de scarcity-balk)
  badge         TEXT,                            -- expliciete badge (bv. 'Limited · 500'), anders afgeleid
  drop_id       UUID REFERENCES drops(id) ON DELETE SET NULL,
  weight_grams  INTEGER,                         -- voor shipping calc
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_drop ON products(drop_id);

-- ============================================================
-- PRODUCT VARIANTS (size + color combinaties)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_variants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku          TEXT UNIQUE NOT NULL,
  size         TEXT,                              -- 'S', 'M', 'L', 'XL'
  color        TEXT,                              -- 'Grey', 'Blue'
  color_hex    TEXT,                              -- '#A9A9A9' voor swatch
  price_cents  INTEGER,                           -- optional override van product
  image_url    TEXT,                              -- variant-specifieke afbeelding
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

-- ============================================================
-- INVENTORY (per variant)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  variant_id    UUID PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL DEFAULT 0,
  reserved      INTEGER NOT NULL DEFAULT 0,       -- voor in-progress orders
  low_stock_at  INTEGER DEFAULT 5,                -- threshold voor "bijna op" badge
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS (gast checkout = nullable supabase_user_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_user_id UUID UNIQUE,                   -- link naar auth.users (optional)
  email           TEXT UNIQUE NOT NULL,
  first_name      TEXT,
  last_name       TEXT,
  phone           TEXT,
  accepts_marketing BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number      TEXT UNIQUE NOT NULL,           -- bv. 'VH-2026-00001'
  customer_id       UUID REFERENCES customers(id),
  customer_email    TEXT NOT NULL,                  -- snapshot
  customer_name     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | paid | shipped | delivered | cancelled | refunded
  payment_status    TEXT NOT NULL DEFAULT 'open',    -- open | authorized | paid | failed | expired | refunded
  mollie_payment_id TEXT,                            -- Mollie's tr_xxx ID
  subtotal_cents    INTEGER NOT NULL DEFAULT 0,
  shipping_cents    INTEGER NOT NULL DEFAULT 0,
  tax_cents         INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'EUR',
  shipping_address  JSONB,                          -- { street, city, postal_code, country }
  billing_address   JSONB,
  notes             TEXT,
  paid_at           TIMESTAMPTZ,
  shipped_at        TIMESTAMPTZ,
  tracking_number   TEXT,
  tracking_carrier  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_mollie ON orders(mollie_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);

-- ============================================================
-- ORDER ITEMS (snapshot van producten bij bestelling)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id    UUID REFERENCES product_variants(id),
  product_id    UUID REFERENCES products(id),
  product_name  TEXT NOT NULL,                     -- snapshot
  variant_label TEXT,                              -- 'Grey / M'
  sku           TEXT,
  unit_price_cents INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  total_cents   INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ============================================================
-- NEWSLETTER SUBSCRIBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  source        TEXT,                              -- 'footer', 'popup', 'drop-notify'
  confirmed     BOOLEAN DEFAULT FALSE,
  unsubscribed_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WISHLIST (later — voor logged-in users)
-- ============================================================
CREATE TABLE IF NOT EXISTS wishlist_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, product_id)
);

-- ============================================================
-- DROP NOTIFICATIONS (notify-me lijsten)
-- ============================================================
CREATE TABLE IF NOT EXISTS drop_notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  drop_id       UUID NOT NULL REFERENCES drops(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  notified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (drop_id, email)
);

-- ============================================================
-- PRODUCT REVIEWS (moderatie: approved-vlag)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_slug  TEXT NOT NULL,
  name          TEXT NOT NULL,
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body          TEXT NOT NULL,
  approved      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_slug ON product_reviews(product_slug, approved);

-- ============================================================
-- BACK-IN-STOCK MELDINGEN (per product + maat)
-- ============================================================
CREATE TABLE IF NOT EXISTS back_in_stock (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_slug  TEXT NOT NULL,
  size          TEXT,
  email         TEXT NOT NULL,
  notified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_slug, size, email)
);

-- ============================================================
-- HET ATELIER — geclaimde nummers (claim-je-nummer-finale)
-- ============================================================
CREATE TABLE IF NOT EXISTS atelier_claims (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  garment     TEXT,
  colour      TEXT,
  initials    TEXT,
  number      INTEGER NOT NULL,
  edition     INTEGER NOT NULL DEFAULT 500,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atelier_created ON atelier_claims(created_at);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE back_in_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE atelier_claims ENABLE ROW LEVEL SECURITY;

-- Public read: published products + drops
CREATE POLICY "Public read published products" ON products
  FOR SELECT USING (status = 'published');

CREATE POLICY "Public read variants" ON product_variants
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND p.status = 'published')
  );

CREATE POLICY "Public read inventory" ON inventory
  FOR SELECT USING (TRUE);

CREATE POLICY "Public read drops" ON drops
  FOR SELECT USING (status IN ('coming-soon', 'live', 'sold-out'));

CREATE POLICY "Public read approved reviews" ON product_reviews
  FOR SELECT USING (approved = TRUE);

-- Writes alleen via service-role key (server-side endpoints).
-- Geen public INSERT/UPDATE/DELETE policies = blocked by default.

-- Customers kunnen hun eigen orders zien (als ze inloggen)
CREATE POLICY "Customer reads own orders" ON orders
  FOR SELECT USING (
    customer_id IN (
      SELECT id FROM customers WHERE supabase_user_id = auth.uid()
    )
  );

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Genereer order_number (VH-YYYY-XXXXX)
CREATE OR REPLACE FUNCTION generate_order_number() RETURNS TEXT AS $$
DECLARE
  yr INT := EXTRACT(YEAR FROM NOW());
  seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 9) AS INT)), 0) + 1
  INTO seq
  FROM orders
  WHERE order_number LIKE 'VH-' || yr || '-%';
  RETURN 'VH-' || yr || '-' || LPAD(seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- Voorraadmutaties (atomair; zie ook migrations/20260704_inventory_functions.sql)
CREATE OR REPLACE FUNCTION reserve_inventory(v_id UUID, qty INT) RETURNS BOOLEAN AS $$
BEGIN
  IF qty <= 0 THEN RETURN FALSE; END IF;
  UPDATE inventory
  SET reserved = reserved + qty,
      updated_at = NOW()
  WHERE variant_id = v_id
    AND quantity - reserved >= qty;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION finalize_inventory(v_id UUID, qty INT) RETURNS BOOLEAN AS $$
BEGIN
  IF qty <= 0 THEN RETURN FALSE; END IF;
  UPDATE inventory
  SET quantity = GREATEST(0, quantity - qty),
      reserved = GREATEST(0, reserved - qty),
      updated_at = NOW()
  WHERE variant_id = v_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_inventory(v_id UUID, qty INT) RETURNS BOOLEAN AS $$
BEGIN
  IF qty <= 0 THEN RETURN FALSE; END IF;
  UPDATE inventory
  SET reserved = GREATEST(0, reserved - qty),
      updated_at = NOW()
  WHERE variant_id = v_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Updated_at triggers
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_drops_updated ON drops;
CREATE TRIGGER trg_drops_updated BEFORE UPDATE ON drops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED DATA (development only — verwijder voor productie)
-- ============================================================
-- INSERT INTO drops (slug, title, description, status, launch_date, total_pieces) VALUES
--   ('sweater-stories', 'Sweater Stories', 'Eerste limited edition van de derde generatie.', 'coming-soon', NOW() + INTERVAL '14 days', 500);

-- INSERT INTO products (slug, name, description, price_cents, status, featured, image_url, category) VALUES
--   ('heritage-hoodie-grey', 'Heritage Hoodie Grey', '350gsm cotton blend hoodie met embroidered Villa Happ logo.', 12900, 'published', TRUE, '/img/products/hoodie-grey-front.png', 'hoodies'),
--   ('heritage-hoodie-blue', 'Heritage Hoodie Blue', '350gsm cotton blend hoodie in vintage Tilburg blue.', 12900, 'published', TRUE, '/img/products/hoodie-blue-front.png', 'hoodies');
