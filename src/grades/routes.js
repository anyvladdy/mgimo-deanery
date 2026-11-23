import { Hono } from 'hono';
import { gradeOverview, gradesForStudent, gradeRowsForOverview, gradeHistory, latestGrades } from './grades.js';
import { gradesPage, gradeHistoryPage, transcriptPage } from './pages.js';
import { planForStudent } from '../plan/plan.js';
import { messagePage } from '../ui/layout.js';

export function gradesRoutes(db) {
  const routes = new Hono();
  routes.get('/', c => c.html(gradesPage(
    gradeOverview(gradeRowsForOverview(db, c.get('studentId')), c.req.query('view')),
    c.get('student'),
    c.get('csrfToken'),
  )));
  routes.get('/transcript', c => {
    const studentId = c.get('studentId');
    return c.html(transcriptPage(
      latestGrades(gradesForStudent(db, studentId)),
      planForStudent(db, studentId).courses,
      c.get('student'), c.get('csrfToken'),
    ));
  });
  routes.get('/:id/history', c => {
    const id = Number(c.req.param('id'));
    const history = Number.isSafeInteger(id) && id > 0 ? gradeHistory(db, c.get('studentId'), id) : null;
    return history ? c.html(gradeHistoryPage(history, c.get('student'), c.get('csrfToken')))
      : c.html(messagePage('Результат не найден', 'Откройте дисциплину из вашей ведомости.', '/grades', 'Вернуться к ведомости',
        { student: c.get('student'), csrf: c.get('csrfToken'), active: 'grades' }), 404);
  });
  return routes;
}
