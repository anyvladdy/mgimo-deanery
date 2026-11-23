import { approvedStatus, postponementKind } from '../requests/requests.js';

const retainable = `
  SELECT s.id AS student_id, c.subject, c.assessment, c.credits, s.group_code
  FROM students s JOIN current_plan_courses c ON c.group_code = s.group_code
  WHERE s.group_code = ? AND (? IS NULL OR s.id = ?) AND (
    COALESCE((SELECT TRIM(g.result) FROM grades g
      WHERE g.student_id = s.id AND g.subject = c.subject AND g.assessment = c.assessment
      ORDER BY g.id DESC LIMIT 1), '') <> ''
    OR EXISTS (SELECT 1 FROM document_requests r JOIN request_courses rc ON rc.request_id = r.id
      WHERE r.student_id = s.id AND r.kind = ? AND r.status = ?
        AND rc.subject = c.subject AND rc.assessment = c.assessment)
  )
`;

export function coursesToRetain(db, group, studentId) {
  return db.prepare(`${retainable} ORDER BY c.subject, c.assessment`)
    .all(group, studentId, studentId, postponementKind, approvedStatus);
}

export function retainCourses(db, group, studentId = null) {
  db.prepare(`
    INSERT INTO student_retained_courses (student_id, subject, assessment, credits, origin_group)
    ${retainable}
    ON CONFLICT(student_id, subject, assessment) DO NOTHING
  `).run(group, studentId, studentId, postponementKind, approvedStatus);
}
