-- XIVARRI initial schema (CLAUDE.md §4).
-- D1 / SQLite. One model covers tickets, merch and trips — the difference is
-- configuration (type + variants + fields), not structure.
--
-- Conventions:
--   * ids are TEXT (app-generated: crypto.randomUUID / nanoid). Seed rows use
--     readable ids so foreign keys are legible in seed.sql.
--   * booleans are INTEGER 0/1 with a CHECK.
--   * money is INTEGER cents; currency defaults to EUR.
--   * timestamps are TEXT ISO-8601 UTC (datetime('now')).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Department — grid of departments on the contact-sheet home.
-- ---------------------------------------------------------------------------
CREATE TABLE department (
  id        TEXT PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  position  INTEGER NOT NULL DEFAULT 0,

  name_ca   TEXT NOT NULL,
  name_es   TEXT,            -- optional; falls back to _ca (§5)
  name_en   TEXT,

  photo_url TEXT             -- typographic fallback if missing (§4 / §8)
);

-- ---------------------------------------------------------------------------
-- Activity — an event, a merch product line, or a trip.
-- ---------------------------------------------------------------------------
CREATE TABLE activity (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  department_id  TEXT NOT NULL
                   REFERENCES department(id) ON DELETE RESTRICT,
  type           TEXT NOT NULL
                   CHECK (type IN ('event', 'merch', 'trip')),

  title_ca       TEXT NOT NULL,
  title_es       TEXT,
  title_en       TEXT,

  description_ca TEXT,
  description_es TEXT,
  description_en TEXT,

  poster_url     TEXT,
  starts_at      TEXT,       -- ISO-8601, nullable (merch has no date)
  location       TEXT,
  edition        TEXT,       -- e.g. "Tardor 2026"; recorded on every Order
  published      INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),

  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_activity_department ON activity(department_id);
CREATE INDEX idx_activity_published  ON activity(published);

-- ---------------------------------------------------------------------------
-- Variant — a purchasable line of an Activity (ticket type / size / bus).
-- ---------------------------------------------------------------------------
CREATE TABLE variant (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL
                REFERENCES activity(id) ON DELETE CASCADE,

  name_ca     TEXT NOT NULL,   -- "General", "Talla M", "Bus + entrada"
  name_es     TEXT,
  name_en     TEXT,

  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sold        INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),

  sale_start  TEXT,            -- ISO-8601, nullable
  sale_end    TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_variant_activity ON variant(activity_id);

-- ---------------------------------------------------------------------------
-- Field — extra checkout questions attached to an Activity (DNI, allergies…).
-- ---------------------------------------------------------------------------
CREATE TABLE field (
  id           TEXT PRIMARY KEY,
  activity_id  TEXT NOT NULL
                 REFERENCES activity(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,

  label_ca     TEXT NOT NULL,
  label_es     TEXT,
  label_en     TEXT,

  type         TEXT NOT NULL
                 CHECK (type IN ('text', 'number', 'select', 'checkbox')),
  options_json TEXT,           -- JSON array for select/checkbox choices
  required     INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1))
);

CREATE INDEX idx_field_activity ON field(activity_id);

-- ---------------------------------------------------------------------------
-- Order — a guest checkout. Identity is the email address (no accounts).
-- ---------------------------------------------------------------------------
CREATE TABLE "order" (
  id                    TEXT PRIMARY KEY,
  activity_id           TEXT NOT NULL
                          REFERENCES activity(id) ON DELETE RESTRICT,
  edition               TEXT,   -- snapshot of activity.edition at purchase

  buyer_name            TEXT NOT NULL,
  buyer_email           TEXT NOT NULL,
  buyer_phone           TEXT,

  total_cents           INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  currency              TEXT NOT NULL DEFAULT 'EUR',

  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method        TEXT NOT NULL DEFAULT 'manual'
                          CHECK (payment_method IN ('stripe', 'manual')),

  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,

  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at               TEXT
);

CREATE INDEX idx_order_activity        ON "order"(activity_id);
CREATE INDEX idx_order_activity_edition ON "order"(activity_id, edition);
CREATE INDEX idx_order_status          ON "order"(status);
-- Webhook idempotency: look an order up by its Stripe session fast.
CREATE UNIQUE INDEX idx_order_stripe_session
  ON "order"(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- OrderItem — a bought line. One ticket_code (and QR) per item.
-- ---------------------------------------------------------------------------
CREATE TABLE order_item (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL
                      REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id        TEXT NOT NULL
                      REFERENCES variant(id) ON DELETE RESTRICT,
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),

  field_answers_json TEXT,       -- answers to the Activity's custom Fields
  ticket_code       TEXT NOT NULL UNIQUE,   -- short, unguessable, e.g. K7M2X9
  checked_in_at     TEXT          -- set at the door; blocks QR reuse
);

CREATE INDEX idx_order_item_order   ON order_item(order_id);
CREATE INDEX idx_order_item_variant ON order_item(variant_id);
