CREATE TABLE IF NOT EXISTS university_news (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  campus_event_id INTEGER,
  published_at TEXT NOT NULL
);
