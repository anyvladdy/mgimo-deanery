import { writeTransaction } from '../db/write.js';

export const courseKey = row => JSON.stringify([row.group_code, row.subject, row.assessment]);
const studentAssignments = `
  SELECT a.*, p.group_code AS current_group_code, s.status, s.text, s.link, s.submitted_at, s.feedback, s.reviewed_at, s.revision
  FROM assignments a JOIN students p ON p.id = :studentId
  LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = p.id
  WHERE (a.group_code = p.group_code OR s.student_id IS NOT NULL)
`;

export function studentAssignmentsFor(db, studentId) {
  return db.prepare(`${studentAssignments} ORDER BY a.due_date, a.id DESC`).all({ studentId });
}

export function assignmentForStudent(db, studentId, id) {
  return db.prepare(`${studentAssignments} AND a.id = :id`).get({ studentId, id });
}

export function canSubmit(row, today) {
  return row.group_code === row.current_group_code && row.status !== 'reviewed' && (row.due_date >= today || row.status === 'returned');
}

export function submitAssignment(db, studentId, id, draft, today) {
  return writeTransaction(db, () => {
    const current = assignmentForStudent(db, studentId, id);
    if (!current) return 'missing';
    if (current.status === 'submitted' && current.text === draft.text && current.link === draft.link) return 'ok';
    if (!canSubmit(current, today)) return 'closed';
    if ((current.revision ?? 0) !== draft.revision) return 'stale';
    db.prepare(`
      INSERT INTO assignment_submissions (assignment_id, student_id, text, link, submitted_at, status)
      VALUES (?, ?, ?, ?, deanery_timestamp(), 'submitted')
      ON CONFLICT(assignment_id, student_id) DO UPDATE SET text = excluded.text, link = excluded.link,
        submitted_at = excluded.submitted_at, status = 'submitted', revision = revision + 1,
        feedback = NULL, reviewed_by = NULL, reviewed_at = NULL
    `).run(id, studentId, draft.text, draft.link);
    return 'ok';
  });
}

export function assignmentsForStaff(db, courses) {
  const keys = new Set(courses.map(courseKey));
  return db.prepare(`
    SELECT a.*, (
      SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'submitted'
    ) AS pending FROM assignments a ORDER BY a.id DESC
  `).all().filter(row => keys.has(courseKey(row)));
}

export function assignmentForStaff(db, courses, id) {
  const row = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
  return row && courses.some(course => courseKey(course) === courseKey(row)) ? row : null;
}

export function publishAssignment(db, staffId, course, { title, description, date, key }) {
  return writeTransaction(db, () => {
    const existing = db.prepare('SELECT id FROM assignments WHERE created_by = ? AND request_key = ?').get(staffId, key);
    if (existing) return existing.id;
    return db.prepare(`
      INSERT INTO assignments (group_code, subject, assessment, title, description, due_date, created_by, published_at, request_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, deanery_timestamp(), ?) RETURNING id
    `).get(course.group_code, course.subject, course.assessment, title, description, date, staffId, key).id;
  });
}

export function submissionsForStaff(db, assignmentId) {
  return db.prepare(`
    SELECT s.*, p.full_name
    FROM assignment_submissions s JOIN students p ON p.id = s.student_id
    WHERE assignment_id = ? ORDER BY s.status <> 'submitted', s.submitted_at DESC, s.student_id
  `).all(assignmentId);
}

export function reviewSubmission(db, staffId, assignmentId, studentId, { status, feedback, revision }) {
  return writeTransaction(db, () => {
    const current = db.prepare(`
      SELECT status, feedback, revision, reviewed_by FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?
    `).get(assignmentId, studentId);
    if (!current) return 'missing';
    if (current.status === status && current.feedback === feedback && current.revision === revision && current.reviewed_by === staffId) return 'ok';
    if (current.status !== 'submitted' || current.revision !== revision) return 'stale';
    db.prepare(`
      UPDATE assignment_submissions SET status = ?, feedback = ?, reviewed_by = ?, reviewed_at = deanery_timestamp()
      WHERE assignment_id = ? AND student_id = ?
    `).run(status, feedback, staffId, assignmentId, studentId);
    return 'ok';
  });
}
