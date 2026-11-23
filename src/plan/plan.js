import { modulesFor } from '../modules/config.js';
import { recordedPostponementsForStudent } from '../db/retained-courses.js';

export const courseKey = row => JSON.stringify([row.subject, row.assessment]);

function transaction(db, begin, readOrWrite) {
  db.exec(begin);
  try {
    const result = readOrWrite();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function readPlan(db, studentId) {
  const modules = modulesFor(db);
  const grades = modules.get('grades');
  const syllabus = modules.get('syllabus');
  const electives = modules.has('electives');
  const required = db.prepare(`
    SELECT p.subject, p.assessment, p.credits
    FROM students s JOIN current_plan_courses p ON p.group_code = s.group_code
    WHERE s.id = ?
    ORDER BY p.subject, p.assessment
  `).all(studentId);
  const options = electives ? db.prepare(`
    SELECT b.id AS block_id, b.title, b.period, b.is_open AND g.group_code IS NOT NULL AS is_open,
           o.id, o.subject, o.description, o.assessment, o.credits,
           o.capacity - (SELECT COUNT(*) FROM plan_choices WHERE option_id = o.id) AS seats_left,
           pc.option_id = o.id AS selected
    FROM students s
    CROSS JOIN plan_choice_blocks b
    LEFT JOIN plan_choice_groups g ON g.block_id = b.id AND g.group_code = s.group_code
    LEFT JOIN plan_choices pc ON pc.student_id = s.id AND pc.block_id = b.id
    LEFT JOIN plan_options o ON o.block_id = b.id AND (g.group_code IS NOT NULL OR o.id = pc.option_id)
    WHERE s.id = ? AND (g.group_code IS NOT NULL OR pc.option_id IS NOT NULL)
    ORDER BY b.id, o.id
  `).all(studentId) : [];
  const blocks = Array.from(Map.groupBy(options, row => row.block_id), ([id, rows]) => ({
    id,
    title: rows[0].title,
    period: rows[0].period,
    open: Boolean(rows[0].is_open),
    options: rows.filter(row => row.id !== null),
  }));

  // Идентификаторы ведомости идут по порядку, поэтому последняя строка даёт актуальный результат.
  const results = new Map(grades?.gradesForStudent(db, studentId).map(row => [courseKey(row), row.result]));
  const postponedRequests = recordedPostponementsForStudent(db, studentId);
  const moved = new Map(postponedRequests.map(row => [courseKey(row), row.id]));
  const syllabuses = new Map(syllabus?.listSyllabuses(db).map(row => [row.subject, row.id]));
  const version = db.prepare(`
    SELECT p.version FROM students s JOIN plan_published_groups p ON p.group_code = s.group_code
    WHERE s.id = ?
  `).get(studentId)?.version;
  const saved = db.prepare(`
    SELECT subject, assessment, credits, origin_group FROM student_retained_courses
    WHERE student_id = ? ORDER BY subject, assessment
  `).all(studentId);
  const compulsory = new Map(required.map(course => [courseKey(course), course]));
  for (const course of saved) {
    const current = compulsory.get(courseKey(course));
    if (!current || current.credits !== course.credits) {
      compulsory.set(courseKey(course), { ...course, retained: true });
    }
  }
  const rows = [...compulsory.values(), ...options
    .filter(option => option.selected && !compulsory.has(courseKey(option)))
    .map(option => ({ ...option, elective: true }))];
  const courses = rows.filter(course => course.elective || !moved.has(courseKey(course)))
    .map(course => ({ ...course, syllabus: syllabuses.get(course.subject), ...grades?.gradeOutcome(results.get(courseKey(course))) }));
  const postponed = Array.from(compulsory.values()).filter(course => moved.has(courseKey(course)))
    .map(course => ({ ...course, requestId: modules.has('postponements') ? moved.get(courseKey(course)) : null }));
  const history = electives ? db.prepare(`
    SELECT b.title, old.subject AS previous_subject, new.subject AS next_subject, h.changed_at
    FROM plan_choice_history h
    JOIN plan_choice_blocks b ON b.id = h.block_id
    LEFT JOIN plan_options old ON old.id = h.previous_option
    LEFT JOIN plan_options new ON new.id = h.next_option
    WHERE h.student_id = ?
    ORDER BY h.id DESC LIMIT 20
  `).all(studentId) : [];
  return {
    courses,
    postponed,
    version,
    blocks,
    history,
    features: { grades: Boolean(grades), syllabus: Boolean(syllabus), electives },
    planned: courses.reduce((sum, course) => sum + course.credits, 0),
    earned: courses.reduce((sum, course) => sum + (course.passed ? course.credits : 0), 0),
  };
}

export function planForStudent(db, studentId) {
  return transaction(db, 'BEGIN', () => readPlan(db, studentId));
}

function updateChoice(db, studentId, blockId, optionId, withdraw) {
  const option = db.prepare(`
    SELECT b.is_open, o.capacity, pc.option_id AS current_option,
           (SELECT COUNT(*) FROM plan_choices WHERE option_id = o.id) AS taken
    FROM students s
    JOIN plan_choice_groups g ON g.group_code = s.group_code
    JOIN plan_choice_blocks b ON b.id = g.block_id
    JOIN plan_options o ON o.block_id = b.id
    LEFT JOIN plan_choices pc ON pc.student_id = s.id AND pc.block_id = b.id
    WHERE s.id = ? AND b.id = ? AND o.id = ?
  `).get(studentId, blockId, optionId);
  if (!option) return 'missing';
  if (!option.is_open) return 'closed';

  if (withdraw) {
    const deleted = db.prepare(`
      DELETE FROM plan_choices WHERE student_id = ? AND block_id = ? AND option_id = ?
    `).run(studentId, blockId, optionId);
    if (deleted.changes) recordChange(db, studentId, blockId, optionId, null);
    return 'ok';
  }
  if (option.current_option === optionId) return 'ok';
  if (option.taken >= option.capacity) return 'full';

  db.prepare(`
    INSERT INTO plan_choices (student_id, block_id, option_id) VALUES (?, ?, ?)
    ON CONFLICT(student_id, block_id) DO UPDATE SET option_id = excluded.option_id
  `).run(studentId, blockId, optionId);
  recordChange(db, studentId, blockId, option.current_option, optionId);
  return 'ok';
}

function recordChange(db, studentId, blockId, previousOption, nextOption) {
  db.prepare(`
    INSERT INTO plan_choice_history (student_id, block_id, previous_option, next_option, changed_at)
    VALUES (?, ?, ?, ?, deanery_timestamp())
  `).run(studentId, blockId, previousOption, nextOption);
}

// Отмена выборов при смене группы, в том числе когда модуль был отключён.
export function reconcileElectives(db, studentId = null) {
  const orphans = db.prepare(`
    SELECT pc.student_id, pc.block_id, pc.option_id
    FROM plan_choices pc JOIN students s ON s.id = pc.student_id
    WHERE (? IS NULL OR s.id = ?) AND NOT EXISTS (
      SELECT 1 FROM plan_choice_groups g
      WHERE g.block_id = pc.block_id AND g.group_code = s.group_code
    )
  `).all(studentId, studentId);
  if (!orphans.length) return;

  const remove = db.prepare('DELETE FROM plan_choices WHERE student_id = ? AND block_id = ?');
  for (const choice of orphans) {
    remove.run(choice.student_id, choice.block_id);
    recordChange(db, choice.student_id, choice.block_id, choice.option_id, null);
  }
}

export function changePlanChoice(db, studentId, blockId, optionId, { withdraw = false } = {}) {
  if (!modulesFor(db).has('electives')) return 'missing';
  try {
    return transaction(db, 'BEGIN IMMEDIATE', () => updateChoice(db, studentId, blockId, optionId, withdraw));
  } catch (error) {
    // SQLite не дал захватить блокировку записи. Можно безопасно повторить запрос.
    if (error.errcode === 5) return 'busy';
    throw error;
  }
}
