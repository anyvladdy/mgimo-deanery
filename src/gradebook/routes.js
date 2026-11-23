import { Hono } from 'hono';
import { gradebook, createSheet, sheetForStaff, updateSheetRow, publishSheet } from './gradebook.js';
import { sheetsPage, sheetPage } from './pages.js';
import { messagePage } from '../ui/layout.js';

const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
function missing(c) {
  return c.html(messagePage('Ведомость недоступна', 'Откройте ведомости по вашим дисциплинам.',
    '/office/gradebook', 'К ведомостям', context(c)), 404);
}

function parseCourse(value) {
  if (typeof value !== 'string' || value.length > 800) return null;
  try {
    const course = JSON.parse(value);
    return Array.isArray(course) && course.length === 3 && course.every(part => typeof part === 'string')
      ? course : null;
  } catch {
    return null;
  }
}

export function gradebookRoutes(db) {
  const routes = new Hono();
  const list = (c, error = '') => sheetsPage(gradebook(db, c.get('staff')), context(c), error);
  const details = (c, id, error = '', status = 200) => {
    const sheet = sheetForStaff(db, c.get('staff'), id);
    return sheet ? c.html(sheetPage(sheet, context(c), error), status) : missing(c);
  };
  routes.get('/', c => c.html(list(c)));
  routes.post('/', c => {
    const form = c.get('form');
    const course = parseCourse(form.course);
    if (!course || !['main', 'retake'].includes(form.kind)) return c.html(list(c, 'Выберите дисциплину и тип ведомости.'), 422);
    const result = createSheet(db, c.get('staff'), course, form.kind);
    if (result.id) return c.redirect(`/office/gradebook/${result.id}`, 303);
    const empty = form.kind === 'retake'
      ? 'Для пересдачи нет студентов с задолженностью или неявкой в опубликованной основной ведомости.'
      : 'Для ведомости нет подходящих студентов.';
    const message = result.error === 'active' ? 'Сначала завершите открытый черновик по этой дисциплине.'
      : result.error === 'empty' ? empty : 'Дисциплина недоступна.';
    return c.html(list(c, message), result.error === 'active' ? 409 : 422);
  });
  routes.get('/:id', c => details(c, idFrom(c.req.param('id'))));
  routes.post('/:id/rows/:studentId', c => {
    const id = idFrom(c.req.param('id'));
    const student = idFrom(c.req.param('studentId'));
    const form = c.get('form');
    const outcome = updateSheetRow(db, c.get('staff'), id, student, form.attendance, form.result);
    if (outcome === 'ok') return c.redirect(`/office/gradebook/${id}#row-${student}`, 303);
    if (outcome === 'missing') return missing(c);
    if (outcome === 'ineligible') return details(c, id, 'Проверьте состав ведомости. Студентов, которые больше не входят в состав, отметьте как исключённых.', 409);
    return details(c, id, outcome === 'invalid' ? 'Проверьте явку и результат.' : 'Ведомость уже опубликована.', 409);
  });
  routes.post('/:id/publish', c => {
    const id = idFrom(c.req.param('id'));
    const outcome = publishSheet(db, c.get('staff'), id);
    if (outcome === 'ok') return c.redirect(`/office/gradebook/${id}`, 303);
    if (outcome === 'missing') return missing(c);
    if (outcome === 'roster-updated') {
      return details(c, id, 'В ведомость добавлены новые студенты группы. Заполните их строки перед публикацией.', 409);
    }
    const message = outcome === 'postponed'
      ? 'Состав изменился после открытия ведомости. Проверьте затронутые строки и обновите их перед публикацией.'
      : 'Укажите явку для каждого студента и сохраните результаты присутствовавших.';
    return details(c, id, message, 409);
  });
  return routes;
}
