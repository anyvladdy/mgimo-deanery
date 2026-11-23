import { dayForStudent } from '../schedule/schedule.js';

export function lessonsToday(db, studentId, date) {
  return dayForStudent(db, studentId, date);
}
