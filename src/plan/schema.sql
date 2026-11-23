CREATE TABLE IF NOT EXISTS plan_group_courses (
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  PRIMARY KEY (group_code, subject, assessment)
);

CREATE TABLE IF NOT EXISTS student_retained_courses (
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  origin_group TEXT NOT NULL,
  PRIMARY KEY (student_id, subject, assessment)
);

-- Опубликованный состав группы хранится в читаемой проекции плана.
CREATE TABLE IF NOT EXISTS plan_published_groups (
  group_code TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS plan_published_courses (
  group_code TEXT NOT NULL REFERENCES plan_published_groups(group_code),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  PRIMARY KEY (group_code, subject, assessment)
);
