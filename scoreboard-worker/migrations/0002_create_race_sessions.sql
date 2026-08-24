CREATE TABLE IF NOT EXISTS race_sessions (
  id TEXT PRIMARY KEY,
  actor_hash TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  checkpoint_index INTEGER NOT NULL DEFAULT 0,
  last_checkpoint_at INTEGER,
  finished_at INTEGER,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS race_sessions_expiry
  ON race_sessions (expires_at);
