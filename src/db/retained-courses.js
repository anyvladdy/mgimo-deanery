import { hasTable } from './sql.js';

export function hasStoredPlan(db) {
  return hasTable(db, 'plan_group_courses') && Boolean(db.prepare(
    "SELECT 1 FROM sqlite_schema WHERE type = 'view' AND name = 'current_plan_courses'",
  ).get());
}

function retainable(db) {
  // Уже полученные результаты и одобренные переносы сохраняют силу после
  // отключения интерфейса, через который их когда-то оформили.
  const grounds = [];
  if (hasTable(db, 'grades')) grounds.push(`
    COALESCE((SELECT TRIM(g.result) FROM grades g
      WHERE g.student_id = s.id AND g.subject = c.subject AND g.assessment = c.assessment
      ORDER BY g.id DESC LIMIT 1), '') <> ''
  `);
  if (hasTable(db, 'request_courses') && hasTable(db, 'document_requests')) grounds.push(`
    EXISTS (SELECT 1 FROM document_requests r JOIN request_courses rc ON rc.request_id = r.id
      WHERE r.student_id = s.id AND r.kind = 'Перенос дисциплины' AND r.status = 'Одобрено'
        AND rc.subject = c.subject AND rc.assessment = c.assessment)
  `);
  return `
    SELECT s.id AS student_id, c.subject, c.assessment, c.credits, s.group_code
    FROM students s JOIN current_plan_courses c ON c.group_code = s.group_code
    WHERE s.group_code = ? AND (? IS NULL OR s.id = ?) AND (${grounds.join(' OR ') || '0'})
  `;
}

export function coursesToRetain(db, group, studentId) {
  return db.prepare(`${retainable(db)} ORDER BY c.subject, c.assessment`).all(group, studentId, studentId);
}

export function retainCourses(db, group, studentId = null) {
  if (!hasTable(db, 'student_retained_courses') || !hasStoredPlan(db)) return;
  db.prepare(`
    INSERT INTO student_retained_courses (student_id, subject, assessment, credits, origin_group)
    ${retainable(db)}
    ON CONFLICT(student_id, subject, assessment) DO NOTHING
  `).run(group, studentId, studentId);
}

export function recordedPostponementsForStudent(db, studentId) {
  if (!hasTable(db, 'request_courses') || !hasTable(db, 'document_requests')) return [];
  return db.prepare(`
    SELECT r.id, c.subject, c.assessment
    FROM document_requests r JOIN request_courses c ON c.request_id = r.id
    WHERE r.student_id = ? AND r.kind = 'Перенос дисциплины' AND r.status = 'Одобрено'
  `).all(studentId);
}
