CREATE TABLE IF NOT EXISTS request_courses (
  request_id INTEGER PRIMARY KEY REFERENCES document_requests(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL
);
