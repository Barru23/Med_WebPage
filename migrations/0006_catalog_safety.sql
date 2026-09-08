PRAGMA foreign_keys = ON;

-- A variant can no longer be physically deleted once an order points at it.
-- Keep the historical row for tickets/exports and hide it from new purchases.
ALTER TABLE variant ADD COLUMN active INTEGER NOT NULL DEFAULT 1
  CHECK (active IN (0, 1));

CREATE INDEX idx_variant_activity_active
  ON variant(activity_id, active, position);

-- Lets a checkout detect an admin edit that raced with session creation. Open
-- sessions already stored in D1 are expired by the admin action; this revision
-- closes the smaller gap before Stripe's session id has been persisted.
ALTER TABLE activity ADD COLUMN catalog_revision INTEGER NOT NULL DEFAULT 0;
