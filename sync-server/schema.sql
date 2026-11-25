-- Neatly Household sync. One row per synced record; "seq" orders changes within a household.
CREATE TABLE IF NOT EXISTS households (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rows (
  household TEXT NOT NULL,
  tbl TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  changed_at TEXT NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (household, tbl, id)
);
CREATE INDEX IF NOT EXISTS rows_by_seq ON rows (household, seq);
