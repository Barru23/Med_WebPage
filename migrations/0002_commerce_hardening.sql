PRAGMA foreign_keys = ON;

ALTER TABLE order_item ADD COLUMN variant_name_snapshot TEXT;
ALTER TABLE order_item ADD COLUMN unit_price_cents INTEGER;
ALTER TABLE order_item ADD COLUMN collected_at TEXT;

CREATE TABLE stock_reservation (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES "order"(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL REFERENCES variant(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE UNIQUE INDEX idx_stock_reservation_order_variant ON stock_reservation(order_id, variant_id);
CREATE INDEX idx_stock_reservation_variant_expiry ON stock_reservation(variant_id, expires_at, consumed_at);

CREATE TABLE stripe_event (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
