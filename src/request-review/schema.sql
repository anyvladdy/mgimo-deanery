CREATE TABLE IF NOT EXISTS request_reviews (
  request_id INTEGER PRIMARY KEY REFERENCES document_requests(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  comment TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS request_clarifications (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES document_requests(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  asked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  question TEXT NOT NULL,
  answer TEXT,
  answered_at TEXT,
  read_at TEXT,
  CHECK ((answer IS NULL) = (answered_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS request_clarifications_one_open
  ON request_clarifications(request_id) WHERE answered_at IS NULL;

CREATE INDEX IF NOT EXISTS request_clarifications_history ON request_clarifications(request_id, id);
