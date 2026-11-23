CREATE TABLE IF NOT EXISTS deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER REFERENCES students(id),
  group_code TEXT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  due_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK ((student_id IS NULL) <> (group_code IS NULL))
);

CREATE INDEX IF NOT EXISTS deadlines_by_student ON deadlines(student_id, due_date);
CREATE INDEX IF NOT EXISTS deadlines_by_group ON deadlines(group_code, due_date);

CREATE TABLE IF NOT EXISTS deadline_completions (
  deadline_id INTEGER NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id),
  completed_at TEXT NOT NULL,
  PRIMARY KEY (deadline_id, student_id)
);
