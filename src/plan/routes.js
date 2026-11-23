import { Hono } from 'hono';
import { changePlanChoice, planForStudent } from './plan.js';
import { electivesPage, planPage } from './pages.js';
import { messagePage } from '../ui/layout.js';
import { modulesFor } from '../modules/config.js';

const notices = {
  closed: 'Запись в этом блоке закрыта. Посмотрите другие доступные курсы.',
  full: 'На этом курсе уже нет мест. Выберите другой вариант.',
};

function positiveId(raw) {
  const value = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : 0;
  return Number.isSafeInteger(value) ? value : 0;
}

export function planRoutes(db, { electives = false } = {}) {
  const base = electives ? '/electives' : '/plan';
  const render = electives ? electivesPage : planPage;
  const routes = new Hono();
  const disciplineHref = modulesFor(db).get('disciplines')?.disciplineHref;
  const page = (c, error = '') => render(planForStudent(db, c.get('studentId')), {
    student: c.get('student'), csrf: c.get('csrfToken'), error, disciplineHref,
  });
  routes.get('/', c => c.html(page(c)));

  const change = withdraw => c => {
    const block = positiveId(c.req.param('block'));
    const option = positiveId(c.get('form').option);
    const result = block && option
      ? changePlanChoice(db, c.get('studentId'), block, option, { withdraw })
      : 'missing';

    if (result === 'ok') return c.redirect(`${base}#choice-${block}`, 303);
    if (notices[result]) return c.html(page(c, notices[result]), 409);
    const busy = result === 'busy';
    return c.html(messagePage(
      busy ? 'Список мест обновляется' : 'Курс недоступен',
      busy ? 'Повторите действие через несколько секунд.' : 'Откройте блоки выбора вашей группы.',
      base,
      electives ? 'К дисциплинам по выбору' : 'К учебному плану',
      { student: c.get('student'), csrf: c.get('csrfToken'), active: electives ? 'electives' : 'plan' },
    ), busy ? 503 : 404);
  };
  if (modulesFor(db).has('electives')) {
    routes.post('/:block/choice', change(false));
    routes.post('/:block/withdraw', change(true));
  }
  return routes;
}
