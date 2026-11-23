CREATE TABLE IF NOT EXISTS curriculum_versions (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL REFERENCES academic_groups(code),
  version INTEGER NOT NULL CHECK (version > 0),
  state TEXT NOT NULL CHECK (state IN ('draft', 'published', 'archived')),
  revision INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES staff_accounts(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by INTEGER REFERENCES staff_accounts(id),
  published_at TEXT,
  UNIQUE (group_code, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_one_draft ON curriculum_versions(group_code) WHERE state = 'draft';

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_one_published ON curriculum_versions(group_code) WHERE state = 'published';

CREATE TABLE IF NOT EXISTS curriculum_courses (
  version_id INTEGER NOT NULL REFERENCES curriculum_versions(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  PRIMARY KEY (version_id, subject, assessment)
);
