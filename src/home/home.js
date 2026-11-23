import { modulesFor } from '../modules/config.js';

export function lessonsToday(db, studentId, { date, time }, includeAgenda = false) {
  const schedule = modulesFor(db).get('schedule');
  if (!schedule) return { status: 'unavailable', later: [] };
  const lessons = schedule.dayForStudent(db, studentId, date);
  const [lesson, ...later] = lessons.filter(item => item.ends_at > time);
  const status = lesson ? (lesson.starts_at <= time ? 'current' : 'upcoming') : lessons.length ? 'finished' : 'empty';
  const agenda = includeAgenda ? ['Сегодня', 'Завтра', 'Послезавтра'].map((label, offset) => {
    const day = schedule.shiftDate(date, offset);
    return { label, date: day, lessons: offset ? schedule.dayForStudent(db, studentId, day) : lessons };
  }) : null;
  return { status, lesson, later, agenda, time };
}
