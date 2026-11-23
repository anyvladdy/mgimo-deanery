import { writeTransaction } from '../db/write.js';
import { hasTable } from '../db/sql.js';
import { modulesFor } from '../modules/config.js';
import { snapshotCurriculum } from './snapshot.js';

export function curriculumIndex(db) {
  return db.prepare(`
    SELECT g.code, g.program, g.year,
      (SELECT COUNT(*) FROM current_plan_courses c WHERE c.group_code = g.code) AS courses,
      (SELECT v.version FROM curriculum_versions v WHERE v.group_code = g.code AND v.state = 'published') AS published,
      (SELECT v.id FROM curriculum_versions v WHERE v.group_code = g.code AND v.state = 'draft') AS draft
    FROM academic_groups g ORDER BY g.program, g.year, g.code
  `).all();
}

function currentCourses(db, group) {
  return db.prepare('SELECT subject, assessment, credits FROM current_plan_courses WHERE group_code = ? ORDER BY subject, assessment').all(group);
}

export function versionsForGroup(db, group) {
  return db.prepare(`
    SELECT v.*, s.full_name AS publisher FROM curriculum_versions v
    LEFT JOIN staff_accounts s ON s.id = v.published_by
    WHERE v.group_code = ? ORDER BY v.version DESC
  `).all(group);
}

function selectedVersion(db, id) {
  return db.prepare('SELECT * FROM curriculum_versions WHERE id = ?').get(id);
}

function coursesForVersion(db, id) {
  return db.prepare('SELECT subject, assessment, credits FROM curriculum_courses WHERE version_id = ? ORDER BY subject, assessment').all(id);
}

function writeCourses(db, id, courses) {
  const insert = db.prepare('INSERT INTO curriculum_courses (version_id, subject, assessment, credits) VALUES (?, ?, ?, ?)');
  for (const course of courses) insert.run(id, course.subject, course.assessment, course.credits);
}

export function createDraft(db, groupCode, staffId) {
  return writeTransaction(db, () => {
    if (!modulesFor(db).get('registry').academicGroup(db, groupCode)) return null;
    const versions = versionsForGroup(db, groupCode);
    const existing = versions.find(item => item.state === 'draft');
    if (existing) return existing.id;
    let number = (versions[0]?.version ?? 0) + 1;
    const courses = currentCourses(db, groupCode);
    // Первая управляемая версия фиксирует ранее действовавший план группы.
    if (number === 1 && courses.length) {
      const baseline = db.prepare(`
        INSERT INTO curriculum_versions (group_code, version, state, created_at, published_at)
        VALUES (?, 1, 'published', deanery_timestamp(), deanery_timestamp()) RETURNING id
      `).get(groupCode);
      writeCourses(db, baseline.id, courses);
      snapshotCurriculum(db, groupCode, baseline.id);
      number += 1;
    }
    const draft = db.prepare(`
      INSERT INTO curriculum_versions (group_code, version, state, created_by, created_at)
      VALUES (?, ?, 'draft', ?, deanery_timestamp()) RETURNING id
    `).get(groupCode, number, staffId);
    writeCourses(db, draft.id, courses);
    return draft.id;
  });
}

function compareCourses(previous, current, courseKey) {
  const before = new Map(previous.map(row => [courseKey(row), row]));
  const after = new Map(current.map(row => [courseKey(row), row]));
  return [
    ...current.flatMap(row => {
      const old = before.get(courseKey(row));
      return old?.credits === row.credits ? [] : [{ ...row, before: old?.credits ?? null, after: row.credits }];
    }),
    ...previous.filter(row => !after.has(courseKey(row))).map(row => ({ ...row, before: row.credits, after: null })),
  ];
}

export function curriculumDetails(db, id) {
  const version = selectedVersion(db, id);
  if (!version) return null;
  const courses = coursesForVersion(db, id);
  const modules = modulesFor(db);
  return {
    ...version,
    group: modules.get('registry').academicGroup(db, version.group_code),
    courses,
    changes: version.state === 'draft' ? compareCourses(currentCourses(db, version.group_code), courses, modules.get('plan').courseKey) : [],
  };
}

export function editCurriculumCourse(db, id, { subject, assessment, credits }, remove) {
  return writeTransaction(db, () => {
    const version = selectedVersion(db, id);
    if (!version) return 'missing';
    if (version.state !== 'draft') return 'locked';
    const edit = remove
      ? db.prepare('DELETE FROM curriculum_courses WHERE version_id = ? AND subject = ? AND assessment = ?').run(id, subject, assessment)
      : db.prepare(`
        INSERT INTO curriculum_courses VALUES (?, ?, ?, ?)
        ON CONFLICT(version_id, subject, assessment) DO UPDATE SET credits = excluded.credits
        WHERE curriculum_courses.credits <> excluded.credits
      `).run(id, subject, assessment, credits);
    if (edit.changes) db.prepare('UPDATE curriculum_versions SET revision = revision + 1 WHERE id = ?').run(id);
    return 'ok';
  });
}

// SQLite LOWER() не меняет кириллицу, поэтому перечисляем канонические значения
// ведомости явно, включая вариант с заглавной первой буквой.
const failingResult = `TRIM(g.result) IN ('2', 'Не зачтено', 'не зачтено', 'Неудовлетворительно', 'неудовлетворительно')`;

// Удалять дисциплину из плана можно, только когда по ней нет незакрытого долга.
// Основная ведомость сохраняет состав и после перевода студента в другую группу.
function hasOutstandingDebt(db, group, subject, assessment) {
  if (!hasTable(db, 'grades')) return false;
  const current = db.prepare(`
    SELECT 1 FROM students s JOIN grades g ON g.student_id = s.id
    WHERE s.group_code = ? AND g.subject = ? AND g.assessment = ?
      AND g.id = (SELECT MAX(g2.id) FROM grades g2
        WHERE g2.student_id = g.student_id AND g2.subject = g.subject AND g2.assessment = g.assessment)
      AND ${failingResult}
  `).get(group, subject, assessment);
  if (current) return true;
  const retained = db.prepare(`
    SELECT 1 FROM student_retained_courses rc
    JOIN grades g ON g.student_id = rc.student_id
      AND g.subject = rc.subject AND g.assessment = rc.assessment
    WHERE rc.origin_group = ? AND rc.subject = ? AND rc.assessment = ?
      AND g.id = (SELECT MAX(g2.id) FROM grades g2
        WHERE g2.student_id = g.student_id AND g2.subject = g.subject AND g2.assessment = g.assessment)
      AND ${failingResult}
  `).get(group, subject, assessment);
  if (retained) return true;
  if (!hasTable(db, 'grade_sheets') || !hasTable(db, 'grade_sheet_rows')) return false;
  return Boolean(db.prepare(`
    SELECT 1 FROM grade_sheets sh
    JOIN grade_sheet_rows r ON r.sheet_id = sh.id
    JOIN grades g ON g.student_id = r.student_id
      AND g.subject = sh.subject AND g.assessment = sh.assessment
    WHERE sh.group_code = ? AND sh.subject = ? AND sh.assessment = ?
      AND sh.kind = 'main' AND sh.status = 'published'
      AND g.id = (SELECT MAX(g2.id) FROM grades g2
        WHERE g2.student_id = g.student_id AND g2.subject = g.subject AND g2.assessment = g.assessment)
      AND ${failingResult}
  `).get(group, subject, assessment));
}

export function publishCurriculum(db, id, revision, staffId) {
  return writeTransaction(db, () => {
    const version = curriculumDetails(db, id);
    if (!version) return 'missing';
    if (version.state === 'published') return 'ok';
    if (version.state !== 'draft' || version.revision !== revision) return 'stale';
    if (!version.courses.length) return 'empty';
    const activeSheet = hasTable(db, 'grade_sheets') ? db.prepare(`
      SELECT 1 FROM grade_sheets WHERE group_code = ? AND subject = ? AND assessment = ? AND status = 'draft'
    `) : null;
    const removed = version.changes.filter(course => course.after === null);
    if (removed.some(course => activeSheet?.get(version.group_code, course.subject, course.assessment))) return 'gradebook';
    if (removed.some(course => hasOutstandingDebt(db, version.group_code, course.subject, course.assessment))) return 'debt';

    modulesFor(db).get('plan').retainCourses(db, version.group_code);
    db.prepare(`
      INSERT INTO plan_group_courses (group_code, subject, assessment, credits)
      SELECT ?, subject, assessment, credits FROM curriculum_courses WHERE version_id = ?
      ON CONFLICT(group_code, subject, assessment) DO NOTHING
    `).run(version.group_code, id);
    db.prepare("UPDATE curriculum_versions SET state = 'archived' WHERE group_code = ? AND state = 'published'").run(version.group_code);
    db.prepare("UPDATE curriculum_versions SET state = 'published', published_by = ?, published_at = deanery_timestamp() WHERE id = ?")
      .run(staffId, id);
    snapshotCurriculum(db, version.group_code, id);
    return 'ok';
  });
}
