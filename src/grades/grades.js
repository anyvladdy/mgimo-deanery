import { approvedStatus, postponementKind } from '../requests/requests.js';
import { isDate } from '../schedule/schedule.js';

// Студент выбирается из проверенной серверной сессии.
export function gradesForStudent(db, studentId) {
  return db.prepare(`
    SELECT id, subject, assessment, result, exam_date FROM grades
    WHERE student_id = ?
    ORDER BY id
  `).all(studentId);
}

export function gradeRowsForOverview(db, studentId) {
  return db.prepare(`
    SELECT g.id, g.subject, g.assessment, g.result, g.exam_date
    FROM grades g JOIN students s ON s.id = g.student_id
    WHERE g.student_id = ? AND (
      COALESCE(TRIM(g.result), '') <> ''
      OR (
        NOT EXISTS (
          SELECT 1 FROM document_requests r JOIN request_courses c ON c.request_id = r.id
          WHERE r.student_id = g.student_id AND r.kind = ? AND r.status = ?
            AND c.subject = g.subject AND c.assessment = g.assessment
        ) AND (
          EXISTS (SELECT 1 FROM current_plan_courses c WHERE c.group_code = s.group_code
            AND c.subject = g.subject AND c.assessment = g.assessment)
          OR EXISTS (SELECT 1 FROM plan_choices c JOIN plan_options o ON o.id = c.option_id
            WHERE c.student_id = g.student_id AND o.subject = g.subject AND o.assessment = g.assessment)
          OR NOT EXISTS (
            SELECT 1 FROM student_movements m JOIN plan_group_courses c ON c.group_code = m.previous_group
            WHERE m.student_id = g.student_id AND c.subject = g.subject AND c.assessment = g.assessment
            UNION ALL
            SELECT 1 FROM curriculum_versions v JOIN curriculum_courses c ON c.version_id = v.id
            WHERE v.group_code = s.group_code AND v.state = 'archived' AND c.subject = g.subject AND c.assessment = g.assessment
          )
        )
      )
    )
    ORDER BY g.id
  `).all(studentId, postponementKind, approvedStatus);
}

export const gradeCourseKey = row => JSON.stringify([row.subject, row.assessment]);

export function latestGrades(grades) {
  return Array.from(new Map(grades.map(row => [gradeCourseKey(row), row])).values());
}

export function gradeHistory(db, studentId, gradeId) {
  const course = db.prepare('SELECT subject, assessment FROM grades WHERE id = ? AND student_id = ?').get(gradeId, studentId);
  if (!course) return null;
  const attempts = db.prepare(`
    SELECT g.id, g.result, g.exam_date, s.id AS sheet_id, s.kind, s.published_at
    FROM grades g
    LEFT JOIN grade_attempt_details d ON d.grade_id = g.id
    LEFT JOIN grade_sheets s ON s.id = d.sheet_id
    WHERE g.student_id = ? AND g.subject = ? AND g.assessment = ?
    ORDER BY g.id DESC
  `).all(studentId, course.subject, course.assessment);
  return { ...course, attempts };
}

const failingResults = new Set(['2', 'не зачтено', 'неудовлетворительно']);

export function gradeOutcome(value) {
  const result = value?.trim() ?? '';
  const normalized = result.toLowerCase();
  const mark = /^[2-5]$/.test(result) ? Number(result) : null;
  const state = !result ? 'pending' : failingResults.has(normalized) ? 'debts' : 'recorded';
  return { result, mark, state, passed: normalized === 'зачтено' || mark >= 3 };
}

export function gradeOverview(grades, requestedView) {
  const view = requestedView === 'debts' || requestedView === 'pending' ? requestedView : 'all';
  const rows = latestGrades(grades).map(grade => ({ ...grade, ...gradeOutcome(grade.result) }));
  const marks = rows.flatMap(row => row.mark === null ? [] : [row.mark]);
  const pending = rows.filter(row => row.state === 'pending').sort((left, right) =>
    (left.exam_date || '9999-12-31').localeCompare(right.exam_date || '9999-12-31'));
  const debts = rows.filter(row => row.state === 'debts');
  return {
    view,
    rows: { all: rows, debts, pending }[view],
    hasGrades: rows.length > 0,
    average: marks.length ? marks.reduce((sum, mark) => sum + mark, 0) / marks.length : null,
    pendingCount: pending.length,
    debtCount: debts.length,
  };
}

export function upcomingAssessmentsForStudent(db, studentId, date) {
  const { rows } = gradeOverview(gradeRowsForOverview(db, studentId), 'pending');
  return rows.filter(row => isDate(row.exam_date) && row.exam_date >= date);
}

export function pendingAssessmentHref(gradeId) {
  return `/grades?view=pending#grade-${gradeId}`;
}
