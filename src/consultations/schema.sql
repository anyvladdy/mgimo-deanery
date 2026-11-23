CREATE TABLE IF NOT EXISTS consultation_slots (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  subject TEXT NOT NULL,
  group_code TEXT REFERENCES academic_groups(code),
  slot_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  room TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('offline', 'online')),
  capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 20),
  note TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS consultation_bookings (
  slot_id INTEGER NOT NULL REFERENCES consultation_slots(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  topic TEXT NOT NULL,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  PRIMARY KEY (slot_id, student_id)
);

CREATE INDEX IF NOT EXISTS consultation_slots_date ON consultation_slots(slot_date, starts_at);
CREATE INDEX IF NOT EXISTS consultation_bookings_student ON consultation_bookings(student_id, slot_id);
