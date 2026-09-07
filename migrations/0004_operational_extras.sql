PRAGMA foreign_keys = ON;

-- Maximum units one buyer may take in a single order. NULL = no limit, which
-- is what every existing activity keeps. Promised by requisits-produccio.md §5
-- but never modelled until now.
ALTER TABLE activity ADD COLUMN max_per_order INTEGER
  CHECK (max_per_order IS NULL OR max_per_order > 0);

-- Failed admin logins, so a shared password cannot be guessed at machine speed.
-- Rows are written only on failure and swept once they fall out of the window.
CREATE TABLE login_attempt (
  id           TEXT PRIMARY KEY,
  ip           TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_login_attempt_ip ON login_attempt(ip, attempted_at);
