import { Hono } from 'hono';
import { homePage } from './pages.js';
import { outstandingClarifications } from '../requests/requests.js';
import { upcomingAssessmentsForStudent } from '../grades/grades.js';
import { lessonsToday } from './home.js';
import { markChangeRead } from '../schedule/schedule.js';

export function homeRoutes(db, currentSchoolDay) {
  const routes = new Hono();

  routes.get('/', c => {
    const schoolDay = currentSchoolDay();
    const studentId = c.get('studentId');
    return c.html(homePage({
      student: c.get('student'),
      date: schoolDay.date,
      ...lessonsToday(db, studentId, schoolDay),
      csrf: c.get('csrfToken'),
      clarifications: outstandingClarifications(db, studentId),
      assessments: upcomingAssessmentsForStudent(db, studentId, schoolDay.date).slice(0, 3),
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
