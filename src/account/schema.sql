CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  faculty TEXT NOT NULL,
  program TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year > 0),
  group_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  salt BLOB NOT NULL,
  password_hash BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
