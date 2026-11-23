CREATE TABLE IF NOT EXISTS teaching_assignments (
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  PRIMARY KEY (staff_id, group_code, subject, assessment),
  FOREIGN KEY (group_code, subject, assessment) REFERENCES plan_group_courses(group_code, subject, assessment)
);

CREATE TABLE IF NOT EXISTS grade_sheets (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('main', 'retake')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by INTEGER NOT NULL REFERENCES staff_accounts(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by INTEGER REFERENCES staff_accounts(id),
  published_at TEXT,
  digest TEXT,
  FOREIGN KEY (group_code, subject, assessment) REFERENCES plan_group_courses(group_code, subject, assessment)
);

CREATE UNIQUE INDEX IF NOT EXISTS one_open_grade_sheet
  ON grade_sheets(group_code, subject, assessment) WHERE status = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS one_main_grade_sheet
  ON grade_sheets(group_code, subject, assessment) WHERE kind = 'main';

CREATE TABLE IF NOT EXISTS grade_sheet_rows (
  sheet_id INTEGER NOT NULL REFERENCES grade_sheets(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  attendance TEXT CHECK (attendance IN ('present', 'absent', 'excluded')),
  result TEXT,
  PRIMARY KEY (sheet_id, student_id)
);

CREATE TABLE IF NOT EXISTS grade_attempt_details (
  grade_id INTEGER PRIMARY KEY REFERENCES grades(id),
  sheet_id INTEGER NOT NULL REFERENCES grade_sheets(id)
);
