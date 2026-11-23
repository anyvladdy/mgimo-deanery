CREATE TABLE IF NOT EXISTS urgent_recipients (
  level TEXT NOT NULL CHECK (level IN ('program', 'dean', 'rector')),
  scope TEXT NOT NULL,
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  PRIMARY KEY (level, scope),
  CHECK ((level = 'rector' AND scope = '') OR (level <> 'rector' AND scope <> ''))
);

CREATE TABLE IF NOT EXISTS urgent_appeals (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  request_id INTEGER REFERENCES document_requests(id),
  program TEXT NOT NULL,
  faculty TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('program', 'dean', 'rector')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  response TEXT,
  resolved_at TEXT,
  UNIQUE (student_id, request_key)
);

CREATE TABLE IF NOT EXISTS urgent_appeal_events (
  id INTEGER PRIMARY KEY,
  appeal_id INTEGER NOT NULL REFERENCES urgent_appeals(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  level TEXT NOT NULL CHECK (level IN ('program', 'dean', 'rector')),
  kind TEXT NOT NULL CHECK (kind IN ('forwarded', 'resolved')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS urgent_appeals_student ON urgent_appeals(student_id, id);
CREATE INDEX IF NOT EXISTS urgent_appeals_recipient ON urgent_appeals(level, program, faculty);
CREATE INDEX IF NOT EXISTS urgent_appeal_events_appeal ON urgent_appeal_events(appeal_id, id);
