PRAGMA foreign_keys = ON;

-- When the Apps Script relay last accepted this order. NULL means the sheet
-- row and the buyer's email never got out — D1 stays authoritative either way,
-- so a failed relay must never undo a confirmed payment. The Sales screen
-- shows these and offers a resync.
ALTER TABLE "order" ADD COLUMN relay_synced_at TEXT;

CREATE INDEX idx_order_relay_pending
  ON "order"(status, relay_synced_at);
