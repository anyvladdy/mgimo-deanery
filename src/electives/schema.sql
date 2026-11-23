CREATE TABLE IF NOT EXISTS plan_choice_blocks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  period TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 0 CHECK (is_open IN (0, 1))
);

CREATE TABLE IF NOT EXISTS plan_choice_groups (
  block_id INTEGER NOT NULL REFERENCES plan_choice_blocks(id),
  group_code TEXT NOT NULL,
  PRIMARY KEY (block_id, group_code)
);

CREATE TABLE IF NOT EXISTS plan_options (
  id INTEGER PRIMARY KEY,
  block_id INTEGER NOT NULL REFERENCES plan_choice_blocks(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  assessment TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  UNIQUE (block_id, id)
);

CREATE TABLE IF NOT EXISTS plan_choices (
  student_id INTEGER NOT NULL REFERENCES students(id),
  block_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  PRIMARY KEY (student_id, block_id),
  FOREIGN KEY (block_id, option_id) REFERENCES plan_options(block_id, id)
);

CREATE INDEX IF NOT EXISTS plan_choices_by_option ON plan_choices(option_id);

CREATE TABLE IF NOT EXISTS plan_choice_history (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  block_id INTEGER NOT NULL REFERENCES plan_choice_blocks(id),
  previous_option INTEGER REFERENCES plan_options(id),
  next_option INTEGER REFERENCES plan_options(id),
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (previous_option IS NOT NULL OR next_option IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS plan_choice_history_by_student ON plan_choice_history(student_id, id DESC);
