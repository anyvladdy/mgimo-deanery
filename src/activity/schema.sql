CREATE TABLE IF NOT EXISTS student_activity (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'login', 'request', 'notice', 'message', 'course', 'event', 'booking', 'deadline', 'theme', 'integration'
  )),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS student_activity_latest
  ON student_activity (student_id, created_at DESC, id DESC);
