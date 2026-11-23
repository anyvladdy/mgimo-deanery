CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  notice_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_reads (
  student_id INTEGER NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL CHECK (kind IN ('group', 'request', 'grade')),
  event_id INTEGER NOT NULL,
  PRIMARY KEY (student_id, kind, event_id)
);

CREATE INDEX IF NOT EXISTS notices_by_group_date ON notices(group_code, notice_date DESC);

CREATE TABLE IF NOT EXISTS notice_requirements (
  notice_id INTEGER NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  PRIMARY KEY (notice_id, module_id)
);
