CREATE TABLE IF NOT EXISTS exam_slots (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL REFERENCES academic_groups(code),
  subject TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  building TEXT NOT NULL,
  room TEXT NOT NULL,
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS exam_slots_history ON exam_slots(group_code, subject, id);

CREATE TABLE IF NOT EXISTS exam_slot_reads (
  student_id INTEGER NOT NULL REFERENCES students(id),
  slot_id INTEGER NOT NULL REFERENCES exam_slots(id),
  PRIMARY KEY (student_id, slot_id)
);
