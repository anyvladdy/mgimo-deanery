// Обработчики передают studentId из проверенной сервером сессии.
import { isDate } from '../modules/clock.js';
import { modulesFor } from '../modules/config.js';

export { demoDate, isDate } from '../modules/clock.js';

export function weekStartOf(date) {
  const value = new Date(`${date}T00:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  return shiftDate(date, -offset);
}

export function shiftDate(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().split('T')[0];
}

export function dayForStudent(db, studentId, date) {
  return db.prepare(`
    SELECT * FROM student_schedule
    WHERE student_id = ? AND lesson_date = ?
    ORDER BY starts_at, lesson_id
  `).all(studentId, date);
}

export function roomOccupancy(db, room, date) {
  return db.prepare(`
    SELECT l.starts_at, l.ends_at
    FROM lessons l LEFT JOIN room_changes c ON c.lesson_id = l.id
    WHERE l.lesson_date = ? AND COALESCE(c.new_room, l.scheduled_room) = ?
    ORDER BY l.starts_at, l.ends_at
  `).all(date, room);
}

export function lessonForStudent(db, studentId, lessonId) {
  return db.prepare('SELECT * FROM student_schedule WHERE student_id = ? AND lesson_id = ?').get(studentId, lessonId);
}

export function weekForStudent(db, studentId, weekStart) {
  const weekEnd = shiftDate(weekStart, 6);
  return db.prepare(`
    SELECT * FROM student_schedule
    WHERE student_id = ? AND lesson_date BETWEEN ? AND ?
    ORDER BY lesson_date, starts_at, lesson_id
  `).all(studentId, isDate(weekStart) ? weekStart : '0000-01-01', isDate(weekEnd) ? weekEnd : '9999-12-31');
}

export function changesForStudent(db, studentId, weekStart) {
  return weekForStudent(db, studentId, weekStart)
    .filter(lesson => lesson.change_id !== null);
}

export function recentChangesForStudent(db, studentId) {
  const publications = modulesFor(db).has('room-publication');
  return db.prepare(`
    SELECT s.*, ${publications ? 'p.published_at' : 'NULL AS published_at'} FROM student_schedule s
    ${publications ? 'LEFT JOIN room_change_publications p ON p.change_id = s.change_id' : ''}
    WHERE s.student_id = ? AND s.change_id IS NOT NULL
    ORDER BY published_at DESC, s.lesson_date DESC, s.change_id DESC LIMIT 25
  `).all(studentId);
}

export function markChangeRead(db, studentId, changeId) {
  db.prepare(`
    INSERT INTO change_reads (student_id, change_id)
    SELECT student_id, change_id FROM student_schedule
    WHERE student_id = ? AND change_id = ?
    ON CONFLICT (student_id, change_id) DO NOTHING
  `).run(studentId, changeId);
}

export function nextLessonForSubject(db, studentId, subject, { date, time }) {
  return db.prepare(`
    SELECT * FROM student_schedule
    WHERE student_id = ? AND subject = ? AND (lesson_date > ? OR (lesson_date = ? AND ends_at > ?))
    ORDER BY lesson_date, starts_at, lesson_id LIMIT 1
  `).get(studentId, subject, date, date, time.slice(0, 5));
}

export function teachersForStudent(db, studentId) {
  return db.prepare(`
    SELECT DISTINCT subject, teacher FROM student_schedule
    WHERE student_id = ? AND teacher <> '' ORDER BY subject, teacher
  `).all(studentId);
}
