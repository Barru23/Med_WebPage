PRAGMA foreign_keys = ON;

-- Immutable checkout answers. Labels and types are copied at purchase time so
-- later edits to the activity cannot rewrite historical manifests or emails.
CREATE TABLE order_item_answer (
  id                  TEXT PRIMARY KEY,
  order_item_id       TEXT NOT NULL REFERENCES order_item(id) ON DELETE CASCADE,
  field_id_snapshot   TEXT NOT NULL,
  label_ca_snapshot   TEXT NOT NULL,
  label_es_snapshot   TEXT,
  label_en_snapshot   TEXT,
  field_type_snapshot TEXT NOT NULL,
  value_text          TEXT NOT NULL,
  position            INTEGER NOT NULL DEFAULT 0,
  UNIQUE(order_item_id, field_id_snapshot)
);

CREATE INDEX idx_order_item_answer_item
  ON order_item_answer(order_item_id, position);

-- Recover labels for existing answers wherever the original field still
-- exists. If it has already disappeared, retain the field id and value.
INSERT OR IGNORE INTO order_item_answer (
  id, order_item_id, field_id_snapshot,
  label_ca_snapshot, label_es_snapshot, label_en_snapshot,
  field_type_snapshot, value_text, position
)
SELECT
  'ans_' || lower(hex(randomblob(12))), oi.id, CAST(j.key AS TEXT),
  COALESCE(f.label_ca, CAST(j.key AS TEXT)), f.label_es, f.label_en,
  COALESCE(f.type, 'text'), CAST(j.value AS TEXT), COALESCE(f.position, 9999)
FROM order_item oi
JOIN json_each(oi.field_answers_json) j
LEFT JOIN field f ON f.id = CAST(j.key AS TEXT)
WHERE oi.field_answers_json IS NOT NULL
  AND json_valid(oi.field_answers_json);
