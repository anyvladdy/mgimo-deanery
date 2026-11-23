CREATE TABLE IF NOT EXISTS message_threads (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  teacher_id INTEGER REFERENCES staff_accounts(id),
  channel TEXT NOT NULL CHECK (channel IN ('office', 'technical', 'teacher')),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 100),
  request_key TEXT NOT NULL,
  CHECK ((channel = 'teacher') = (teacher_id IS NOT NULL)),
  UNIQUE (student_id, request_key)
);

CREATE INDEX IF NOT EXISTS message_threads_by_teacher ON message_threads(teacher_id, id);

CREATE TABLE IF NOT EXISTS thread_messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES message_threads(id),
  staff_id INTEGER REFERENCES staff_accounts(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1600),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  request_key TEXT NOT NULL,
  UNIQUE (thread_id, request_key)
);

CREATE INDEX IF NOT EXISTS thread_messages_by_thread ON thread_messages(thread_id, id);

CREATE TABLE IF NOT EXISTS message_cases (
  thread_id INTEGER PRIMARY KEY REFERENCES message_threads(id),
  assigned_to INTEGER NOT NULL REFERENCES staff_accounts(id),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS message_reply_reads (
  student_id INTEGER NOT NULL REFERENCES students(id),
  message_id INTEGER NOT NULL REFERENCES thread_messages(id),
  PRIMARY KEY (student_id, message_id)
);
