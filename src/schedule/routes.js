import { Hono } from 'hono';
import { dayForStudent, isDate, weekForStudent, weekStartOf } from './schedule.js';
import { schedulePage } from './pages.js';

export function scheduleRoutes(db, currentSchoolDay) {
  const routes = new Hono();

  routes.get('/', c => {
    const requested = c.req.query('date');
    const { date: today } = currentSchoolDay();
    const date = isDate(requested) ? requested : today;
    const weekStart = weekStartOf(date);
    const print = c.req.query('view') === 'print';
    return c.html(schedulePage({
      date,
      today,
      weekStart,
      lessons: print ? [] : dayForStudent(db, c.get('studentId'), date),
      week: weekForStudent(db, c.get('studentId'), weekStart),
      student: c.get('student'),
      csrf: c.get('csrfToken'),
      print,
    }));
  });

  return routes;
}
