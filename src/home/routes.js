import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { presentationVariant } from '../ui/presentation.js';
import { formatDate } from '../ui/format.js';
import { homePage } from './pages.js';
import { lessonsToday } from './home.js';

export function homeRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const schedule = modules.get('schedule');
  const messages = modules.get('messages');
  const requests = modules.get('requests');
  const grades = modules.get('grades');
  const examDetails = modules.get('exams')?.examDetails ?? (assessment => formatDate(assessment.exam_date));
  const shortcuts = [...modules.navigation('studentMain'), ...modules.navigation('studentTools')]
    .filter(([href]) => href !== '/');
  if (modules.navigation('studentServices').length) shortcuts.push(['/services', 'Сервисы']);

  const panels = [...modules.entries()].filter(module => module.todayPanel);

  routes.get('/', async c => {
    const schoolDay = currentSchoolDay();
    const studentId = c.get('studentId');
    const student = c.get('student');
    const csrf = c.get('csrfToken');
    const contributions = await Promise.all(panels.map(async module => {
      try {
        return await module.todayPanel({ db, studentId, student, schoolDay, csrf });
      } catch (error) {
        console.error(`Ошибка карточки «${module.id}»:`, error.message);
        return '';
      }
    }));
    return c.html(homePage({
      student,
      date: schoolDay.date,
      ...lessonsToday(db, studentId, schoolDay, presentationVariant() !== 'lite'),
      csrf,
      replies: messages?.messageReplyNotices(db, studentId, true).slice(0, 3),
      clarifications: modules.has('request-review') ? requests.outstandingClarifications(db, studentId) : [],
      assessments: grades?.upcomingAssessmentsForStudent(db, studentId, schoolDay.date).slice(0, 3).map(assessment => ({
        ...assessment,
        href: grades.pendingAssessmentHref(assessment.id),
        details: examDetails(assessment),
      })),
      shortcuts,
      contributions: contributions.filter(Boolean),
    }));
  });

  if (schedule) {
    routes.post('/read/:changeId', c => {
      const raw = c.req.param('changeId');
      const changeId = /^\d+$/.test(raw) ? Number(raw) : 0;
      if (Number.isSafeInteger(changeId) && changeId > 0) {
        schedule.markChangeRead(db, c.get('studentId'), changeId);
      }
      return c.redirect('/', 303);
    });
  }

  return routes;
}
