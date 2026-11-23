CREATE TABLE IF NOT EXISTS student_themes (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  theme TEXT NOT NULL CHECK (theme IN ('light', 'dark'))
);
