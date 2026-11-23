CREATE TABLE IF NOT EXISTS syllabuses (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  requirements TEXT NOT NULL,
  assessment TEXT NOT NULL,
  literature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS syllabus_formulas (
  syllabus_id INTEGER PRIMARY KEY REFERENCES syllabuses(id) ON DELETE CASCADE,
  current_weight INTEGER NOT NULL CHECK (current_weight BETWEEN 0 AND 100),
  exam_weight INTEGER NOT NULL CHECK (exam_weight BETWEEN 0 AND 100),
  scale TEXT NOT NULL CHECK (scale IN ('5', '10')),
  rounding TEXT NOT NULL CHECK (rounding IN ('none', 'half_up', 'down')),
  updated_by INTEGER REFERENCES staff_accounts(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (current_weight + exam_weight = 100)
);
