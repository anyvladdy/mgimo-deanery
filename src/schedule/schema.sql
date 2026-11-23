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

CREATE VIEW IF NOT EXISTS student_schedule AS
SELECT s.id AS student_id, l.id AS lesson_id, l.subject, l.teacher,
       l.lesson_date, l.starts_at, l.ends_at, l.scheduled_room,
       COALESCE(c.new_room, l.scheduled_room) AS current_room,
       c.id AS change_id, (r.change_id IS NOT NULL) AS is_read
FROM students s
JOIN lessons l ON l.group_code = s.group_code
LEFT JOIN room_changes c ON c.lesson_id = l.id
LEFT JOIN change_reads r ON r.student_id = s.id AND r.change_id = c.id;

CREATE INDEX IF NOT EXISTS lessons_by_group_date ON lessons(group_code, lesson_date);
CREATE INDEX IF NOT EXISTS lessons_by_date ON lessons(lesson_date);
