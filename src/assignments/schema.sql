CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  due_date TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES staff_accounts(id),
  published_at TEXT NOT NULL,
  request_key TEXT NOT NULL,
  UNIQUE (created_by, request_key)
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  assignment_id INTEGER NOT NULL REFERENCES assignments(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  text TEXT NOT NULL,
  link TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'reviewed', 'returned')),
  revision INTEGER NOT NULL DEFAULT 1,
  feedback TEXT,
  reviewed_by INTEGER REFERENCES staff_accounts(id),
  reviewed_at TEXT,
  PRIMARY KEY (assignment_id, student_id),
  CHECK (text <> '' OR link <> '')
);

CREATE INDEX IF NOT EXISTS assignments_by_group ON assignments(group_code, due_date);
CREATE INDEX IF NOT EXISTS submissions_by_student ON assignment_submissions(student_id, assignment_id);
