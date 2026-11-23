CREATE TABLE IF NOT EXISTS staff_accounts (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  salt BLOB NOT NULL,
  password_hash BLOB NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id)
);

CREATE INDEX IF NOT EXISTS staff_sessions_by_staff ON staff_sessions(staff_id);
