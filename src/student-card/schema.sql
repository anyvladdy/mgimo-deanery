CREATE TABLE IF NOT EXISTS student_cards (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  card_number TEXT NOT NULL UNIQUE CHECK (length(trim(card_number)) > 0)
);
