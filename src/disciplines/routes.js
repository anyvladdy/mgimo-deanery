import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { messagePage } from '../ui/layout.js';
import { calculateGrade, courseDetails } from './disciplines.js';
import { disciplineIndex, disciplinePage } from './pages.js';

export function disciplineRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const { planForStudent } = modulesFor(db).get('plan');
  const { disciplineHref } = modulesFor(db).get('disciplines');

  routes.get('/:subject', c => {
    const student = c.get('student');
    const context = { student, csrf: c.get('csrfToken'), active: 'plan' };
    const subject = c.req.param('subject');
    const query = c.req.query();
    const plan = planForStudent(db, student.id);
    const choices = [...plan.courses, ...plan.postponed.map(course => ({ ...course, postponed: true }))]
      .filter(course => course.subject === subject && (!query.assessment || course.assessment === query.assessment));
    if (!choices.length) return c.html(messagePage('Дисциплина не найдена в вашем плане',
      'Проверьте название или откройте учебный план.', '/plan', 'К учебному плану', context), 404);
    if (choices.length > 1) return c.html(disciplineIndex(subject, choices, disciplineHref, context));

    const [course] = choices;
    const details = courseDetails(db, student, course, currentSchoolDay());
    const calculation = calculateGrade(details.formula, query);
    const block = plan.blocks.find(item => item.id === course.block_id);
    return c.html(disciplinePage(course, details, calculation, block, disciplineHref(course), context),
      Object.keys(calculation?.errors ?? {}).length ? 422 : 200);
  });
  return routes;
}
