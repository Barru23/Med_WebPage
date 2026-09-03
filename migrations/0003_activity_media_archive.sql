PRAGMA foreign_keys = ON;

ALTER TABLE activity ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
  CHECK (archived IN (0, 1));
ALTER TABLE activity ADD COLUMN size_guide_json TEXT;
ALTER TABLE activity ADD COLUMN size_guide_image_url TEXT;

CREATE INDEX idx_activity_archived ON activity(archived);

CREATE TABLE activity_image (
  id          TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  image_url   TEXT NOT NULL,
  alt_ca      TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_activity_image_activity
  ON activity_image(activity_id, position);
