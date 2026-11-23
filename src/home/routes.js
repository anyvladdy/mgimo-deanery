import { Hono } from 'hono';
import { homePage } from './pages.js';
import { lessonsToday } from './home.js';
import { demoDate, markChangeRead } from '../schedule/schedule.js';

export function homeRoutes(db) {
  const routes = new Hono();

  routes.get('/', c => {
    return c.html(homePage({
      student: c.get('student'),
      lessons: lessonsToday(db, c.get('studentId'), demoDate),
      csrf: c.get('csrfToken'),
    }));
  });

  routes.post('/read/:changeId', c => {
    const raw = c.req.param('changeId');
    const changeId = /^\d+$/.test(raw) ? Number(raw) : 0;
    if (Number.isSafeInteger(changeId) && changeId > 0) {
      markChangeRead(db, c.get('studentId'), changeId);
    }
    return c.redirect('/', 303);
  });

  return routes;
}
