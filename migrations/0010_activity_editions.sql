PRAGMA foreign_keys = ON;

CREATE TABLE activity_edition (
  id                TEXT PRIMARY KEY,
  activity_id       TEXT NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  starts_at         TEXT,
  ends_at           TEXT,
  location          TEXT,
  max_per_order     INTEGER CHECK (max_per_order IS NULL OR max_per_order > 0),
  published         INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  catalog_revision  INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(activity_id, label)
);

-- Every activity receives a current edition, even activities that previously
-- used NULL as their edition label.
INSERT INTO activity_edition (
  id, activity_id, label, starts_at, location, max_per_order, published,
  catalog_revision
)
SELECT
  'ed_' || lower(hex(randomblob(12))), id,
  COALESCE(NULLIF(trim(edition), ''), 'Edició inicial'),
  starts_at, location, max_per_order, published, catalog_revision
FROM activity;

-- Preserve historical labels that differ from the edition currently selected
-- on the activity. Their sellable configuration remains in order snapshots.
INSERT OR IGNORE INTO activity_edition (id, activity_id, label, published)
SELECT
  'ed_' || lower(hex(randomblob(12))), o.activity_id,
  COALESCE(NULLIF(trim(o.edition), ''), 'Edició inicial'), 0
FROM "order" o
GROUP BY o.activity_id, COALESCE(NULLIF(trim(o.edition), ''), 'Edició inicial');

ALTER TABLE activity ADD COLUMN current_edition_id TEXT
  REFERENCES activity_edition(id) ON DELETE SET NULL;
ALTER TABLE variant ADD COLUMN edition_id TEXT
  REFERENCES activity_edition(id) ON DELETE RESTRICT;
ALTER TABLE "order" ADD COLUMN activity_edition_id TEXT
  REFERENCES activity_edition(id) ON DELETE RESTRICT;

UPDATE activity
SET current_edition_id = (
  SELECT ae.id FROM activity_edition ae
  WHERE ae.activity_id = activity.id
    AND ae.label = COALESCE(NULLIF(trim(activity.edition), ''), 'Edició inicial')
  LIMIT 1
);

UPDATE variant
SET edition_id = (
  SELECT a.current_edition_id FROM activity a WHERE a.id = variant.activity_id
);

UPDATE "order"
SET activity_edition_id = (
  SELECT ae.id FROM activity_edition ae
  WHERE ae.activity_id = "order".activity_id
    AND ae.label = COALESCE(NULLIF(trim("order".edition), ''), 'Edició inicial')
  LIMIT 1
);

CREATE INDEX idx_activity_edition_activity
  ON activity_edition(activity_id, created_at);
CREATE INDEX idx_variant_edition_active
  ON variant(edition_id, active, position);
CREATE INDEX idx_order_activity_edition_id
  ON "order"(activity_edition_id, status);
