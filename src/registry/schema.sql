CREATE TABLE IF NOT EXISTS academic_programs (
  name TEXT PRIMARY KEY,
  faculty TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_groups (
  code TEXT PRIMARY KEY,
  program TEXT NOT NULL REFERENCES academic_programs(name),
  year INTEGER NOT NULL CHECK (year > 0)
);

CREATE TABLE IF NOT EXISTS student_movements (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  previous_group TEXT,
  next_group TEXT NOT NULL REFERENCES academic_groups(code),
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS student_movements_by_student ON student_movements(student_id, id DESC);
