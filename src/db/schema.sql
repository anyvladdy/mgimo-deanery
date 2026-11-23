BEGIN;

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

CREATE TABLE IF NOT EXISTS document_requests (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Принята',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  result TEXT,
  exam_date TEXT
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  notice_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher TEXT NOT NULL,
  lesson_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  scheduled_room TEXT NOT NULL
);

-- В прототипе разбираем один перенос аудитории на занятие.
CREATE TABLE IF NOT EXISTS room_changes (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons(id),
  new_room TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_reads (
  student_id INTEGER NOT NULL REFERENCES students(id),
  change_id INTEGER NOT NULL REFERENCES room_changes(id),
  PRIMARY KEY (student_id, change_id)
);

-- Все три экрана берут текущую аудиторию и отметку прочтения отсюда.
CREATE VIEW IF NOT EXISTS student_schedule AS
SELECT s.id AS student_id, l.id AS lesson_id, l.subject, l.teacher,
       l.lesson_date, l.starts_at, l.ends_at, l.scheduled_room,
       COALESCE(c.new_room, l.scheduled_room) AS current_room,
       c.id AS change_id, (r.change_id IS NOT NULL) AS is_read
FROM students s
JOIN lessons l ON l.group_code = s.group_code
LEFT JOIN room_changes c ON c.lesson_id = l.id
LEFT JOIN change_reads r ON r.student_id = s.id AND r.change_id = c.id;

COMMIT;
