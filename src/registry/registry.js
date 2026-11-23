import { randomBytes } from 'node:crypto';
import { passwordRecord } from '../account/passwords.js';
import { writeTransaction } from '../db/write.js';
import { retainCourses } from '../plan/retained.js';

const groupQuery = `
  SELECT g.code, g.program, g.year, p.faculty
  FROM academic_groups g JOIN academic_programs p ON p.name = g.program
`;

export function groupsForOffice(db) {
  return db.prepare(`${groupQuery} ORDER BY g.program, g.year, g.code`).all();
}

export function registryOverview(db) {
  const groups = db.prepare(`
    SELECT g.code, g.program, g.year,
           (SELECT COUNT(*) FROM students s WHERE s.group_code = g.code) AS students
    FROM academic_groups g ORDER BY g.year, g.code
  `).all();
  const programs = db.prepare('SELECT name, faculty FROM academic_programs ORDER BY faculty, name').all();
  const grouped = Map.groupBy(groups, group => group.program);
  return programs.map(program => ({ ...program, groups: grouped.get(program.name) ?? [] }));
}

export function academicGroup(db, code) {
  return db.prepare(`${groupQuery} WHERE g.code = ?`).get(code);
}

export function addProgram(db, name, faculty) {
  return db.prepare(`
    INSERT INTO academic_programs (name, faculty) VALUES (?, ?) ON CONFLICT(name) DO NOTHING
  `).run(name, faculty).changes > 0;
}

export function addGroup(db, program, code, year) {
  return db.prepare(`
    INSERT INTO academic_groups (code, program, year)
    SELECT ?, name, ? FROM academic_programs WHERE name = ?
    ON CONFLICT(code) DO NOTHING
  `).run(code, year, program).changes > 0;
}

export function movementsForStudent(db, studentId) {
  return db.prepare(`
    SELECT m.previous_group, m.next_group, g.program, m.changed_at, a.full_name AS staff_name
    FROM student_movements m
    JOIN academic_groups g ON g.code = m.next_group
    JOIN staff_accounts a ON a.id = m.staff_id
    WHERE m.student_id = ?
    ORDER BY m.id DESC
  `).all(studentId);
}

export async function enrollStudent(db, staffId, name, login, groupCode) {
  const password = randomBytes(12).toString('base64url');
  const { salt, hash } = await passwordRecord(password);
  return writeTransaction(db, () => {
    const group = academicGroup(db, groupCode);
    if (!group) return { error: 'group' };
    if (db.prepare('SELECT 1 FROM accounts WHERE login = ?').get(login)) return { error: 'login' };
    const student = db.prepare(`
      INSERT INTO students (full_name, faculty, program, year, group_code)
      VALUES (?, ?, ?, ?, ?) RETURNING id
    `).get(name, group.faculty, group.program, group.year, group.code);
    db.prepare('INSERT INTO accounts (student_id, login, salt, password_hash) VALUES (?, ?, ?, ?)')
      .run(student.id, login, salt, hash);
    db.prepare('INSERT INTO student_movements (student_id, staff_id, next_group) VALUES (?, ?, ?)')
      .run(student.id, staffId, group.code);
    return { studentId: student.id, name, login, password, group };
  });
}

// Выбор курса принадлежит блоку группы. При переводе блоки, которых нет у новой
// группы, больше нельзя ни показать, ни отозвать, поэтому освобождаем места и
// оставляем след в личной истории выбора.
function dropChoicesOutsideGroup(db, studentId, groupCode) {
  const orphans = db.prepare(`
    SELECT pc.block_id, pc.option_id
    FROM plan_choices pc
    WHERE pc.student_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM plan_choice_groups g
        WHERE g.block_id = pc.block_id AND g.group_code = ?
      )
  `).all(studentId, groupCode);
  if (!orphans.length) return;

  const remove = db.prepare('DELETE FROM plan_choices WHERE student_id = ? AND block_id = ?');
  const remember = db.prepare(`
    INSERT INTO plan_choice_history (student_id, block_id, previous_option, next_option)
    VALUES (?, ?, ?, NULL)
  `);
  for (const choice of orphans) {
    remove.run(studentId, choice.block_id);
    remember.run(studentId, choice.block_id, choice.option_id);
  }
}

export function moveStudent(db, staffId, studentId, expected, groupCode) {
  return writeTransaction(db, () => {
    const student = db.prepare('SELECT group_code FROM students WHERE id = ?').get(studentId);
    const group = academicGroup(db, groupCode);
    if (!student || !group) return 'missing';
    if (student.group_code === group.code) return 'ok';
    if (student.group_code !== expected) return 'stale';

    retainCourses(db, student.group_code, studentId);
    dropChoicesOutsideGroup(db, studentId, group.code);
    db.prepare('UPDATE students SET group_code = ?, program = ?, faculty = ?, year = ? WHERE id = ?')
      .run(group.code, group.program, group.faculty, group.year, studentId);
    db.prepare(`
      INSERT INTO student_movements (student_id, staff_id, previous_group, next_group) VALUES (?, ?, ?, ?)
    `).run(studentId, staffId, student.group_code, group.code);
    return 'ok';
  });
}
