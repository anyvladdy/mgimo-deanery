CREATE TABLE IF NOT EXISTS assistant_tokens (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_token_revocations (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  revoked_at INTEGER NOT NULL
);
