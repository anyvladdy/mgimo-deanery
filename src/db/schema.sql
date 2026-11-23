BEGIN;

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  faculty TEXT NOT NULL,
  program TEXT NOT NULL,
  year INTEGER NOT NULL CHECK (year > 0),
  group_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  salt BLOB NOT NULL,
  password_hash BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  student_id INTEGER REFERENCES students(id),
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS staff_accounts (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL COLLATE NOCASE UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  salt BLOB NOT NULL,
  password_hash BLOB NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS staff_sessions (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id)
);
CREATE INDEX IF NOT EXISTS staff_sessions_by_staff ON staff_sessions(staff_id);

CREATE TABLE IF NOT EXISTS document_requests (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Принята',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS request_courses (
  request_id INTEGER PRIMARY KEY REFERENCES document_requests(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_reviews (
  request_id INTEGER PRIMARY KEY REFERENCES document_requests(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  comment TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS request_clarifications (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES document_requests(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  asked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  question TEXT NOT NULL,
  answer TEXT,
  answered_at TEXT,
  read_at TEXT,
  CHECK ((answer IS NULL) = (answered_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS request_clarifications_one_open
  ON request_clarifications(request_id) WHERE answered_at IS NULL;
CREATE INDEX IF NOT EXISTS request_clarifications_history ON request_clarifications(request_id, id);

CREATE INDEX IF NOT EXISTS document_requests_by_status ON document_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS syllabuses (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  requirements TEXT NOT NULL,
  assessment TEXT NOT NULL,
  literature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  result TEXT,
  exam_date TEXT
);

CREATE TABLE IF NOT EXISTS plan_group_courses (
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  PRIMARY KEY (group_code, subject, assessment)
);

CREATE TABLE IF NOT EXISTS academic_programs (
  name TEXT PRIMARY KEY,
  faculty TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_groups (
  code TEXT PRIMARY KEY,
  program TEXT NOT NULL REFERENCES academic_programs(name),
  year INTEGER NOT NULL CHECK (year > 0)
);

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

CREATE VIEW IF NOT EXISTS current_plan_courses AS
SELECT p.group_code, p.subject, p.assessment, p.credits FROM plan_group_courses p
WHERE NOT EXISTS (SELECT 1 FROM curriculum_versions v WHERE v.group_code = p.group_code AND v.state = 'published')
UNION ALL
SELECT v.group_code, c.subject, c.assessment, c.credits
FROM curriculum_versions v JOIN curriculum_courses c ON c.version_id = v.id
WHERE v.state = 'published';

CREATE TABLE IF NOT EXISTS student_retained_courses (
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  credits INTEGER NOT NULL CHECK (credits > 0),
  origin_group TEXT NOT NULL,
  PRIMARY KEY (student_id, subject, assessment)
);

CREATE TABLE IF NOT EXISTS student_movements (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  previous_group TEXT,
  next_group TEXT NOT NULL REFERENCES academic_groups(code),
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS student_movements_by_student ON student_movements(student_id, id DESC);

CREATE TABLE IF NOT EXISTS teaching_assignments (
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  PRIMARY KEY (staff_id, group_code, subject, assessment),
  FOREIGN KEY (group_code, subject, assessment) REFERENCES plan_group_courses(group_code, subject, assessment)
);

CREATE TABLE IF NOT EXISTS grade_sheets (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  assessment TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('main', 'retake')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_by INTEGER NOT NULL REFERENCES staff_accounts(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by INTEGER REFERENCES staff_accounts(id),
  published_at TEXT,
  digest TEXT,
  FOREIGN KEY (group_code, subject, assessment) REFERENCES plan_group_courses(group_code, subject, assessment)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_grade_sheet
  ON grade_sheets(group_code, subject, assessment) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS one_main_grade_sheet
  ON grade_sheets(group_code, subject, assessment) WHERE kind = 'main';

CREATE TABLE IF NOT EXISTS grade_sheet_rows (
  sheet_id INTEGER NOT NULL REFERENCES grade_sheets(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  attendance TEXT CHECK (attendance IN ('present', 'absent', 'excluded')),
  result TEXT,
  PRIMARY KEY (sheet_id, student_id)
);

CREATE TABLE IF NOT EXISTS grade_attempt_details (
  grade_id INTEGER PRIMARY KEY REFERENCES grades(id),
  sheet_id INTEGER NOT NULL REFERENCES grade_sheets(id)
);

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

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  notice_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notice_choice_blocks (
  notice_id INTEGER PRIMARY KEY REFERENCES notices(id) ON DELETE CASCADE,
  block_id INTEGER NOT NULL REFERENCES plan_choice_blocks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_reads (
  student_id INTEGER NOT NULL REFERENCES students(id),
  kind TEXT NOT NULL CHECK (kind IN ('group', 'request', 'grade')),
  event_id INTEGER NOT NULL,
  PRIMARY KEY (student_id, kind, event_id)
);

CREATE TABLE IF NOT EXISTS assessment_reminder_reads (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  grade_id INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  exam_date TEXT NOT NULL,
  PRIMARY KEY (student_id, grade_id, exam_date)
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  group_code TEXT NOT NULL,
  subject TEXT NOT NULL,
  teacher TEXT NOT NULL,
  lesson_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  scheduled_room TEXT NOT NULL
);

-- В прототипе разбираем один перенос аудитории на занятие.
CREATE TABLE IF NOT EXISTS room_changes (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons(id),
  new_room TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_change_publications (
  change_id INTEGER PRIMARY KEY REFERENCES room_changes(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_reads (
  student_id INTEGER NOT NULL REFERENCES students(id),
  change_id INTEGER NOT NULL REFERENCES room_changes(id),
  PRIMARY KEY (student_id, change_id)
);

-- Все три экрана берут текущую аудиторию и отметку прочтения отсюда.
CREATE VIEW IF NOT EXISTS student_schedule AS
SELECT s.id AS student_id, l.id AS lesson_id, l.subject, l.teacher,
       l.lesson_date, l.starts_at, l.ends_at, l.scheduled_room,
       COALESCE(c.new_room, l.scheduled_room) AS current_room,
       c.id AS change_id, (r.change_id IS NOT NULL) AS is_read
FROM students s
JOIN lessons l ON l.group_code = s.group_code
LEFT JOIN room_changes c ON c.lesson_id = l.id
LEFT JOIN change_reads r ON r.student_id = s.id AND r.change_id = c.id;

-- Личные страницы и очередь офиса выбирают по студенту/группе на каждом запросе.
CREATE INDEX IF NOT EXISTS grades_by_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS requests_by_student ON document_requests(student_id, id DESC);
CREATE INDEX IF NOT EXISTS lessons_by_group_date ON lessons(group_code, lesson_date);
CREATE INDEX IF NOT EXISTS notices_by_group_date ON notices(group_code, notice_date DESC);

COMMIT;
