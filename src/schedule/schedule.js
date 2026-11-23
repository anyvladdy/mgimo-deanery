// Обработчики передают studentId из проверенной сервером сессии.
export const demoDate = '2026-11-23';

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function weekStartOf(date) {
  const value = new Date(`${date}T00:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dayForStudent(db, studentId, date) {
  return db.prepare(`
    SELECT * FROM student_schedule
    WHERE student_id = ? AND lesson_date = ?
    ORDER BY starts_at, lesson_id
  `).all(studentId, date);
}

export function weekForStudent(db, studentId, weekStart) {
  return db.prepare(`
    SELECT * FROM student_schedule
    WHERE student_id = ? AND lesson_date >= ? AND lesson_date < date(?, '+7 days')
    ORDER BY lesson_date, starts_at, lesson_id
  `).all(studentId, weekStart, weekStart);
}

export function changesForStudent(db, studentId, weekStart) {
  return weekForStudent(db, studentId, weekStart)
    .filter(lesson => lesson.change_id !== null);
}

export function markChangeRead(db, studentId, changeId) {
  db.prepare(`
    INSERT INTO change_reads (student_id, change_id)
    SELECT student_id, change_id FROM student_schedule
    WHERE student_id = ? AND change_id = ?
    ON CONFLICT (student_id, change_id) DO NOTHING
  `).run(studentId, changeId);
}
