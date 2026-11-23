import { createHash } from 'node:crypto';
import { modulesFor } from '../modules/config.js';
import { hasTable } from '../db/sql.js';

const canManageAll = staff => staff.role === 'office' || staff.role === 'admin';
const courseFields = course => [course.group_code, course.subject, course.assessment];

const scope = alias => `(? = 1 OR EXISTS (
  SELECT 1 FROM teaching_assignments a WHERE a.staff_id = ?
    AND a.group_code = ${alias}.group_code AND a.subject = ${alias}.subject AND a.assessment = ${alias}.assessment
))`;
const scopeParams = staff => [canManageAll(staff) ? 1 : 0, staff.id];

export function coursesForStaff(db, staff) {
  return db.prepare(`
    SELECT group_code, subject, assessment FROM current_plan_courses p
    WHERE ${scope('p')} ORDER BY group_code, subject
  `).all(...scopeParams(staff));
}

export function gradebook(db, staff) {
  const courses = coursesForStaff(db, staff);
  const sheets = db.prepare(`
    SELECT id, group_code, subject, assessment, status, kind FROM grade_sheets s
    WHERE ${scope('s')} ORDER BY id DESC
  `).all(...scopeParams(staff));
  return { courses, sheets };
}

function scopedSheet(db, staff, id) {
  return db.prepare(`
    SELECT s.*, a.full_name AS publisher FROM grade_sheets s
    LEFT JOIN staff_accounts a ON a.id = s.published_by
    WHERE s.id = ? AND ${scope('s')}
  `).get(id, ...scopeParams(staff));
}

function sheetRows(db, sheetId) {
  return db.prepare(`
    SELECT r.student_id, s.full_name, s.group_code, r.attendance, r.result
    FROM grade_sheet_rows r JOIN students s ON s.id = r.student_id
    WHERE r.sheet_id = ? ORDER BY r.student_id
  `).all(sheetId);
}

export function sheetForStaff(db, staff, id) {
  const sheet = scopedSheet(db, staff, id);
  if (!sheet) return null;
  const rows = sheetRows(db, id);
  if (sheet.status !== 'draft') return { ...sheet, rows };
  const postponed = postponedStudents(db, sheet.subject, sheet.assessment);
  return { ...sheet, rows: rows.map(row => ({
    ...row, canExclude: isOutsideSheet(db, sheet, row.student_id, row.group_code, postponed),
  })) };
}

function write(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function hasRetakeGrounds(db, [group, subject, assessment], studentId) {
  const latest = db.prepare(`
    SELECT result FROM grades
    WHERE student_id = ? AND subject = ? AND assessment = ?
    ORDER BY id DESC LIMIT 1
  `).get(studentId, subject, assessment);
  const { state } = modulesFor(db).get('grades').gradeOutcome(latest?.result);
  if (state === 'debts') return true;
  if (state !== 'pending') return false;
  return Boolean(db.prepare(`
    SELECT 1 FROM grade_sheets s JOIN grade_sheet_rows r ON r.sheet_id = s.id
    WHERE s.group_code = ? AND s.subject = ? AND s.assessment = ?
      AND s.kind = 'main' AND s.status = 'published' AND r.student_id = ?
      AND r.attendance = 'absent'
  `).get(group, subject, assessment, studentId));
}

// Одобренный перенос продолжает действовать при отключении формы заявок.
function postponedStudents(db, subject, assessment) {
  if (!hasTable(db, 'request_courses') || !hasTable(db, 'document_requests')) return new Set();
  const rows = db.prepare(`
    SELECT r.student_id FROM document_requests r JOIN request_courses c ON c.request_id = r.id
    WHERE r.kind = 'Перенос дисциплины' AND r.status = 'Одобрено'
      AND c.subject = ? AND c.assessment = ?
  `).all(subject, assessment);
  return new Set(rows.map(row => row.student_id));
}

function isOutsideSheet(db, sheet, studentId, currentGroup, postponed) {
  if (postponed.has(studentId)) return true;
  if (sheet.kind === 'retake' && !hasRetakeGrounds(db, courseFields(sheet), studentId)) return true;
  if (currentGroup === sheet.group_code) return false;
  // Пересдача собирается по основной ведомости, поэтому переведённый студент
  // остаётся участником своей прежней дисциплины, пока долг не закрыт.
  if (sheet.kind === 'retake') {
    const inMain = db.prepare(`
      SELECT 1 FROM grade_sheets s JOIN grade_sheet_rows r ON r.sheet_id = s.id
      WHERE s.group_code = ? AND s.subject = ? AND s.assessment = ?
        AND s.kind = 'main' AND s.status = 'published' AND r.student_id = ?
    `).get(sheet.group_code, sheet.subject, sheet.assessment, studentId);
    if (inMain) return false;
    // Долг мог остаться от прежней группы без опубликованной основной ведомости:
    // переведённый студент сохранил дисциплину в личном плане.
    return !db.prepare(`
      SELECT 1 FROM student_retained_courses
      WHERE student_id = ? AND origin_group = ? AND subject = ? AND assessment = ?
    `).get(studentId, sheet.group_code, sheet.subject, sheet.assessment);
  }
  return true;
}

function mergeStudents(...lists) {
  const byId = new Map();
  for (const list of lists) for (const row of list) byId.set(row.id, row);
  return [...byId.values()].sort((left, right) => left.id - right.id);
}

function studentsForSheet(db, [group, subject, assessment], kind, postponed) {
  const current = db.prepare('SELECT id FROM students WHERE group_code = ? ORDER BY id')
    .all(group).filter(student => !postponed.has(student.id));
  if (kind !== 'retake') return current;

  const cohort = db.prepare(`
    SELECT s.id
    FROM grade_sheets sh
    JOIN grade_sheet_rows r ON r.sheet_id = sh.id
    JOIN students s ON s.id = r.student_id
    WHERE sh.group_code = ? AND sh.subject = ? AND sh.assessment = ?
      AND sh.kind = 'main' AND sh.status = 'published'
    ORDER BY s.id
  `).all(group, subject, assessment).filter(student => !postponed.has(student.id));

  const retained = db.prepare(`
    SELECT s.id
    FROM student_retained_courses rc
    JOIN students s ON s.id = rc.student_id
    WHERE rc.origin_group = ? AND rc.subject = ? AND rc.assessment = ?
    ORDER BY s.id
  `).all(group, subject, assessment).filter(student => !postponed.has(student.id));
  return mergeStudents(cohort.length ? cohort : current, retained);
}

export function createSheet(db, staff, course, kind) {
  return write(db, () => {
    const allowed = db.prepare(`
      SELECT 1 FROM current_plan_courses p
      WHERE group_code = ? AND subject = ? AND assessment = ? AND ${scope('p')}
    `).get(...course, ...scopeParams(staff));
    if (!allowed) return { error: 'course' };
    const earlier = db.prepare(`
      SELECT id, kind FROM grade_sheets
      WHERE group_code = ? AND subject = ? AND assessment = ?
        AND (status = 'draft' OR (? = 'main' AND kind = 'main'))
      ORDER BY kind = ? DESC, id DESC LIMIT 1
    `).get(...course, kind, kind);
    if (earlier) {
      return earlier.kind === kind ? { id: earlier.id } : { error: 'active' };
    }

    const eligible = studentsForSheet(db, course, kind, postponedStudents(db, course[1], course[2]));
    const students = kind === 'retake'
      ? eligible.filter(student => hasRetakeGrounds(db, course, student.id))
      : eligible;
    if (!students.length) return { error: 'empty' };

    const created = db.prepare(`
      INSERT INTO grade_sheets (group_code, subject, assessment, kind, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, deanery_timestamp()) RETURNING id
    `).get(...course, kind, staff.id);
    const add = db.prepare('INSERT INTO grade_sheet_rows (sheet_id, student_id) VALUES (?, ?)');
    for (const student of students) add.run(created.id, student.id);
    return created;
  });
}

export function gradeValues(assessment) {
  return assessment === 'Зачёт' ? ['Зачтено', 'Не зачтено'] : ['5', '4', '3', '2'];
}

export function updateSheetRow(db, staff, sheetId, studentId, attendance, result) {
  return write(db, () => {
    const sheet = scopedSheet(db, staff, sheetId);
    if (!sheet) return 'missing';
    if (sheet.status !== 'draft') return 'published';
    if (!['present', 'absent', 'excluded'].includes(attendance) || typeof result !== 'string'
      || (result !== '' && !gradeValues(sheet.assessment).includes(result))) return 'invalid';
    const student = db.prepare(`
      SELECT s.group_code FROM grade_sheet_rows r JOIN students s ON s.id = r.student_id
      WHERE r.sheet_id = ? AND r.student_id = ?
    `).get(sheetId, studentId);
    if (!student) return 'missing';
    const postponed = postponedStudents(db, sheet.subject, sheet.assessment);
    if ((attendance === 'excluded') !== isOutsideSheet(db, sheet, studentId, student.group_code, postponed)) return 'ineligible';
    const updated = db.prepare(`
      UPDATE grade_sheet_rows SET attendance = ?, result = ? WHERE sheet_id = ? AND student_id = ?
    `).run(attendance, attendance === 'present' ? result || null : null, sheetId, studentId);
    return updated.changes ? 'ok' : 'missing';
  });
}

export function publishSheet(db, staff, sheetId) {
  return write(db, () => {
    const sheet = scopedSheet(db, staff, sheetId);
    if (!sheet) return 'missing';
    if (sheet.status === 'published') return 'ok';
    const rows = sheetRows(db, sheetId);
    const postponed = postponedStudents(db, sheet.subject, sheet.assessment);
    if (sheet.kind === 'main') {
      const roster = new Set(rows.map(row => row.student_id));
      const incoming = studentsForSheet(db, courseFields(sheet), sheet.kind, postponed)
        .filter(student => !roster.has(student.id));
      if (incoming.length) {
        const add = db.prepare('INSERT INTO grade_sheet_rows (sheet_id, student_id) VALUES (?, ?)');
        for (const student of incoming) add.run(sheetId, student.id);
        return 'roster-updated';
      }
    }
    if (!rows.length || rows.some(row => !row.attendance || (row.attendance === 'present' && !row.result))) {
      return 'incomplete';
    }
    if (rows.some(row => (row.attendance === 'excluded') !== isOutsideSheet(db, sheet, row.student_id, row.group_code, postponed))) {
      return 'postponed';
    }
    const digest = createHash('sha256')
      .update(JSON.stringify({
        sheet: sheetId, course: courseFields(sheet), kind: sheet.kind, staff: staff.id,
        results: rows.map(({ student_id, attendance, result }) => [student_id, attendance, result]),
      }))
      .digest('hex');
    const insertGrade = db.prepare('INSERT INTO grades (student_id, subject, assessment, result) VALUES (?, ?, ?, ?)');
    const source = db.prepare('INSERT INTO grade_attempt_details (grade_id, sheet_id) VALUES (?, ?)');
    for (const row of rows) {
      if (row.attendance === 'present') {
        const added = insertGrade.run(row.student_id, sheet.subject, sheet.assessment, row.result);
        source.run(added.lastInsertRowid, sheetId);
      }
    }
    db.prepare(`
      UPDATE grade_sheets SET status = 'published', published_by = ?, published_at = deanery_timestamp(), digest = ?
      WHERE id = ?
    `).run(staff.id, digest, sheetId);
    return 'ok';
  });
}

export function publishedResultsForStudent(db, studentId) {
  return db.prepare(`
    SELECT g.id, g.subject, g.result, s.published_at
    FROM grades g JOIN grade_attempt_details d ON d.grade_id = g.id
    JOIN grade_sheets s ON s.id = d.sheet_id
    WHERE g.student_id = ?
    ORDER BY s.published_at DESC, g.id DESC LIMIT 25
  `).all(studentId);
}
