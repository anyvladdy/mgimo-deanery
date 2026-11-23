CREATE TABLE IF NOT EXISTS student_tuition (
  student_id INTEGER PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  funding TEXT NOT NULL CHECK (funding IN ('budget', 'paid')),
  due_date TEXT,
  CHECK (
    (funding = 'budget' AND due_date IS NULL)
    OR (funding = 'paid' AND due_date IS NOT NULL AND date(due_date) IS due_date)
  )
);
