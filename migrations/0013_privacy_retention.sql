PRAGMA foreign_keys = ON;

ALTER TABLE field ADD COLUMN data_classification TEXT NOT NULL DEFAULT 'standard'
  CHECK (data_classification IN ('standard', 'identity', 'health'));

ALTER TABLE order_item_answer ADD COLUMN consented_at TEXT;
ALTER TABLE order_item_answer ADD COLUMN consent_version TEXT;
ALTER TABLE order_item_answer ADD COLUMN data_classification_snapshot TEXT NOT NULL DEFAULT 'standard'
  CHECK (data_classification_snapshot IN ('standard', 'identity', 'health'));
ALTER TABLE "order" ADD COLUMN personal_data_purged_at TEXT;

-- Conservative migration for common existing questions. Admins must still
-- review every field before launch; false positives purge sooner, which is
-- safer than silently retaining health or identity data for twelve months.
UPDATE field
SET data_classification = 'health'
WHERE lower(label_ca) LIKE '%al·l%'
   OR lower(label_ca) LIKE '%alerg%'
   OR lower(label_ca) LIKE '%intoler%'
   OR lower(label_ca) LIKE '%salut%'
   OR lower(label_ca) LIKE '%health%'
   OR lower(label_ca) LIKE '%medic%';

UPDATE field
SET data_classification = 'identity'
WHERE data_classification = 'standard'
  AND (
    lower(label_ca) LIKE '%dni%'
    OR lower(label_ca) LIKE '%nif%'
    OR lower(label_ca) LIKE '%passaport%'
    OR lower(label_ca) LIKE '%passport%'
    OR lower(label_ca) LIKE '%document%'
    OR lower(label_ca) LIKE '%emerg%'
  );

UPDATE order_item_answer
SET data_classification_snapshot = COALESCE(
  (SELECT f.data_classification FROM field f
    WHERE f.id = order_item_answer.field_id_snapshot),
  'standard'
);

CREATE INDEX idx_activity_edition_retention
  ON activity_edition(ends_at, activity_id);
CREATE INDEX idx_order_personal_data_retention
  ON "order"(personal_data_purged_at, paid_at);
