CREATE TABLE IF NOT EXISTS campus_events (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT CHECK (ends_at IS NULL OR ends_at > starts_at),
  place TEXT NOT NULL,
  description TEXT NOT NULL,
  program TEXT,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS campus_events_by_date ON campus_events(event_date, starts_at);

CREATE TABLE IF NOT EXISTS campus_event_registrations (
  event_id INTEGER NOT NULL REFERENCES campus_events(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  registered_at TEXT NOT NULL,
  PRIMARY KEY (event_id, student_id)
);
