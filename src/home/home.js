import { dayForStudent } from '../schedule/schedule.js';

export function lessonsToday(db, studentId, { date, time }) {
  const lessons = dayForStudent(db, studentId, date);
  const [lesson, ...later] = lessons.filter(item => item.ends_at > time);
  if (!lesson) return { status: lessons.length ? 'finished' : 'empty', later };
  return { status: lesson.starts_at <= time ? 'current' : 'upcoming', lesson, later };
}
