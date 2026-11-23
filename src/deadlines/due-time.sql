ALTER TABLE deadlines ADD COLUMN due_time TEXT
  CHECK (due_time IS NULL OR (due_time GLOB '[0-2][0-9]:[0-5][0-9]' AND due_time < '24:00'));
