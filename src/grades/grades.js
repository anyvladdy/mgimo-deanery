import { modulesFor } from '../modules/config.js';
import { hasTable } from '../db/sql.js';
import { hasStoredPlan } from '../db/retained-courses.js';
import { isDate } from '../modules/clock.js';

// Студент выбирается из проверенной серверной сессии.
export function gradesForStudent(db, studentId) {
  return db.prepare(`
    SELECT id, subject, assessment, result, exam_date FROM grades
    WHERE student_id = ?
    ORDER BY id
  `).all(studentId);
}

// Ведомость и редактор экзаменов используют один отбор ожидаемых результатов.
export function pendingGradeVisibility(db) {
  const modules = modulesFor(db);
  const hasPostponements = hasTable(db, 'request_courses') && hasTable(db, 'document_requests');
  const previous = [];
  const current = [];
  const storedPlan = modules.has('plan') || hasStoredPlan(db);
  if (storedPlan) {
    current.push(`EXISTS (
      SELECT 1 FROM current_plan_courses c WHERE c.group_code = s.group_code
        AND c.subject = g.subject AND c.assessment = g.assessment
    )`);
    if (hasTable(db, 'student_movements')) previous.push(`
      SELECT 1 FROM student_movements m JOIN plan_group_courses c ON c.group_code = m.previous_group
      WHERE m.student_id = g.student_id AND c.subject = g.subject AND c.assessment = g.assessment
    `);
  }
  if (modules.has('electives')) current.push(`EXISTS (
    SELECT 1 FROM plan_choices c JOIN plan_options o ON o.id = c.option_id
    WHERE c.student_id = g.student_id AND o.subject = g.subject AND o.assessment = g.assessment
  )`);
  if (storedPlan && hasTable(db, 'curriculum_versions') && hasTable(db, 'curriculum_courses')) previous.push(`
    SELECT 1 FROM curriculum_versions v JOIN curriculum_courses c ON c.version_id = v.id
    WHERE v.group_code = s.group_code AND v.state = 'archived' AND c.subject = g.subject AND c.assessment = g.assessment
  `);
  const filters = [];
  if (previous.length) filters.push(`(${[...current, `NOT EXISTS (${previous.join(' UNION ALL ')})`].join(' OR ')})`);
  if (hasPostponements) filters.push(`NOT EXISTS (
    SELECT 1 FROM document_requests r JOIN request_courses c ON c.request_id = r.id
    WHERE r.student_id = g.student_id AND r.kind = 'Перенос дисциплины' AND r.status = 'Одобрено'
      AND c.subject = g.subject AND c.assessment = g.assessment
  )`);
  return filters.join(' AND ') || '1';
}

export function gradeRowsForOverview(db, studentId) {
  const visibility = pendingGradeVisibility(db);
  const exams = modulesFor(db).has('exams');
  // Опубликованная дата остаётся действующей и без редактора экзаменов.
  const hasSlots = exams || hasTable(db, 'exam_slots');
  const rest = exams ? `
    slot.id AS exam_version, slot.starts_at AS exam_time, slot.building AS exam_building, slot.room AS exam_room,
    slot.published_at AS exam_published_at,
    prior.exam_date AS previous_exam_date, prior.starts_at AS previous_exam_time,
    prior.building AS previous_exam_building, prior.room AS previous_exam_room
  ` : `
    NULL AS exam_version, NULL AS exam_time, NULL AS exam_building, NULL AS exam_room,
    NULL AS exam_published_at, NULL AS previous_exam_date, NULL AS previous_exam_time,
    NULL AS previous_exam_building, NULL AS previous_exam_room
  `;
  const date = hasSlots ? 'COALESCE(slot.exam_date, g.exam_date) AS exam_date' : 'g.exam_date';
  const slot = hasSlots ? `
    LEFT JOIN exam_slots slot ON slot.id = (
      SELECT id FROM exam_slots
      WHERE group_code = s.group_code AND subject = g.subject ORDER BY id DESC LIMIT 1
    ) AND g.assessment = 'Экзамен' AND COALESCE(TRIM(g.result), '') = ''
  ` : '';
  const prior = exams ? `
    LEFT JOIN exam_slots prior ON prior.id = (
      SELECT id FROM exam_slots
      WHERE group_code = slot.group_code AND subject = slot.subject AND id < slot.id ORDER BY id DESC LIMIT 1
    )
  ` : '';
  return db.prepare(`
    SELECT g.id, g.subject, g.assessment, g.result, g.exam_date AS scheduled_exam_date, ${date}, ${rest}
    FROM grades g JOIN students s ON s.id = g.student_id
    ${slot}
    ${prior}
    WHERE g.student_id = ? AND (COALESCE(TRIM(g.result), '') <> '' OR (${visibility}))
    ORDER BY g.id
  `).all(studentId);
}

export const gradeCourseKey = row => JSON.stringify([row.subject, row.assessment]);

export function latestGrades(grades) {
  return Array.from(new Map(grades.map(row => [gradeCourseKey(row), row])).values());
}

export function gradeHistory(db, studentId, gradeId) {
  const course = db.prepare('SELECT subject, assessment FROM grades WHERE id = ? AND student_id = ?').get(gradeId, studentId);
  if (!course) return null;
  const gradebook = modulesFor(db).has('gradebook');
  const columns = gradebook ? 's.id AS sheet_id, s.kind, s.published_at'
    : 'NULL AS sheet_id, NULL AS kind, NULL AS published_at';
  const joins = gradebook ? `
    LEFT JOIN grade_attempt_details d ON d.grade_id = g.id
    LEFT JOIN grade_sheets s ON s.id = d.sheet_id
  ` : '';
  const attempts = db.prepare(`
    SELECT g.id, g.result, g.exam_date, ${columns}
    FROM grades g
    ${joins}
    WHERE g.student_id = ? AND g.subject = ? AND g.assessment = ?
    ORDER BY g.id DESC
  `).all(studentId, course.subject, course.assessment);
  const current = course.assessment === 'Экзамен' && !attempts[0]?.result
    ? latestGrades(gradeRowsForOverview(db, studentId)).find(row => row.id === attempts[0]?.id && isDate(row.exam_date))
    : null;
  return { ...course, attempts, current };
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
    (left.exam_date || '9999-12-31').localeCompare(right.exam_date || '9999-12-31')
    || (left.exam_time || '99:99').localeCompare(right.exam_time || '99:99'));
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

const sessionAssessments = new Set(['Экзамен', 'Зачёт', 'Дифференцированный зачёт']);

export function upcomingSessionAssessmentsForStudent(db, studentId, date) {
  return upcomingAssessmentsForStudent(db, studentId, date).filter(row => sessionAssessments.has(row.assessment));
}

export function pendingAssessmentHref(gradeId) {
  return `/grades?view=pending#grade-${gradeId}`;
}

export function assessmentReminderReads(db, studentId, today) {
  return db.prepare(`
    SELECT grade_id, exam_date FROM assessment_reminder_reads WHERE student_id = ? AND exam_date >= ?
  `).all(studentId, today);
}

export function markAssessmentReminderRead(db, studentId, id, date) {
  db.prepare('INSERT INTO assessment_reminder_reads VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(studentId, id, date);
}

export function courseGrade(db, studentId, subject, assessment) {
  const row = gradeRowsForOverview(db, studentId)
    .findLast(grade => grade.subject === subject && grade.assessment === assessment);
  return row ? { ...row, ...gradeOutcome(row.result) } : null;
}
