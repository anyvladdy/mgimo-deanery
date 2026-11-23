CREATE TABLE IF NOT EXISTS document_requests (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Принята',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS document_requests_by_status ON document_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS requests_by_student ON document_requests(student_id, id DESC);
