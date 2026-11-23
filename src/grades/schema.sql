CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  result TEXT,
  exam_date TEXT
);

CREATE INDEX IF NOT EXISTS grades_by_student ON grades(student_id);

CREATE TABLE IF NOT EXISTS assessment_reminder_reads (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade_id INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  exam_date TEXT NOT NULL,
  PRIMARY KEY (student_id, grade_id, exam_date)
);
