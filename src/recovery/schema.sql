CREATE TABLE IF NOT EXISTS student_password_resets (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES accounts(student_id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by INTEGER REFERENCES staff_accounts(id),
  reviewed_at TEXT,
  code_hash BLOB,
  expires_at INTEGER,
  CHECK ((status = 'approved') = (code_hash IS NOT NULL)),
  CHECK ((code_hash IS NULL) = (expires_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS student_password_resets_pending
  ON student_password_resets(student_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS student_password_resets_by_account ON student_password_resets(student_id, id);
