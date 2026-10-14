PRAGMA foreign_keys = ON;

-- Who opened an order, as a SHA-256 of the client's network key (an IPv4
-- address or an IPv6 /64, see src/lib/clientNetwork.ts) — never the address
-- itself. It exists only to cap how many stock holds one connection keeps
-- open at once, and how many free-order emails it can trigger, so the daily
-- maintenance clears it once the order is a day old.
ALTER TABLE "order" ADD COLUMN client_key TEXT;

CREATE INDEX IF NOT EXISTS idx_order_client_key
  ON "order"(client_key, activity_edition_id, status, created_at);
