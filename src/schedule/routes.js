import { Hono } from 'hono';
import { dayForStudent, demoDate, isDate, weekForStudent, weekStartOf } from './schedule.js';
import { schedulePage } from './pages.js';

export function scheduleRoutes(db) {
  const routes = new Hono();

  routes.get('/', c => {
    const requested = c.req.query('date');
    const date = isDate(requested) ? requested : demoDate;
    const weekStart = weekStartOf(date);
    return c.html(schedulePage({
      date,
      weekStart,
      lessons: dayForStudent(db, c.get('studentId'), date),
      week: weekForStudent(db, c.get('studentId'), weekStart),
      student: c.get('student'),
      csrf: c.get('csrfToken'),
    }));
  });

  return routes;
}
