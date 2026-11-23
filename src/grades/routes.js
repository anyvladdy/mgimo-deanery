import { Hono } from 'hono';
import { gradeOverview, gradesForStudent, gradeRowsForOverview, gradeHistory, latestGrades, gradeCourseKey } from './grades.js';
import { gradesPage, gradeHistoryPage, transcriptPage } from './pages.js';
import { modulesFor } from '../modules/config.js';
import { sessionPage } from './session.js';
import { messagePage } from '../ui/layout.js';

export function gradesRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const transcript = modules.has('transcript');
  const exams = modules.get('exams');
  const studentCourses = modules.get('plan')?.planForStudent;
  const disciplineHref = modules.get('disciplines')?.disciplineHref;
  const cardHref = id => {
    if (!disciplineHref) return null;
    const { courses, postponed } = studentCourses(db, id);
    const keys = new Set([...courses, ...postponed].map(gradeCourseKey));
    return grade => keys.has(gradeCourseKey(grade)) ? disciplineHref(grade) : null;
  };
  routes.get('/', c => c.html(gradesPage(
    gradeOverview(gradeRowsForOverview(db, c.get('studentId')), c.req.query('view')),
    c.get('student'),
    c.get('csrfToken'),
    { transcript, exams, cardHref: cardHref(c.get('studentId')) },
  )));
  routes.get('/session', c => {
    const studentId = c.get('studentId');
    return c.html(sessionPage(db, studentId, currentSchoolDay().date,
      { student: c.get('student'), csrf: c.get('csrfToken') }, cardHref(studentId)));
  });
  if (transcript) routes.get('/transcript', c => {
    const studentId = c.get('studentId');
    return c.html(transcriptPage(
      latestGrades(gradesForStudent(db, studentId)),
      modules.get('plan')?.planForStudent(db, studentId).courses ?? [],
      c.get('student'), c.get('csrfToken'),
    ));
  });
  routes.get('/:id/history', c => {
    const id = Number(c.req.param('id'));
    const history = Number.isSafeInteger(id) && id > 0 ? gradeHistory(db, c.get('studentId'), id) : null;
    return history ? c.html(gradeHistoryPage(history, c.get('student'), c.get('csrfToken'), exams))
      : c.html(messagePage('Результат не найден', 'Откройте дисциплину из вашей ведомости.', '/grades', 'Вернуться к ведомости',
        { student: c.get('student'), csrf: c.get('csrfToken'), active: 'grades' }), 404);
  });
  return routes;
}
