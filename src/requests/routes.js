import { Hono } from 'hono';
import { messagePage } from '../ui/layout.js';
import { listRequests, requestForStudent, createCertificateRequest, postponableCourses, requestPostponement, answerClarification, clarificationLimit } from './requests.js';
import { requestsPage, requestPage } from './pages.js';

function idFrom(value) {
  const id = /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function requestRoutes(db) {
  const routes = new Hono();
  const list = (c, error = '') => requestsPage(
    listRequests(db, c.get('studentId')), postponableCourses(db, c.get('studentId')),
    c.get('csrfToken'), c.get('student'), error,
  );

  routes.get('/', c => c.html(list(c)));

  routes.post('/', c => {
    const id = createCertificateRequest(db, c.get('studentId'));
    return c.redirect(`/requests/${id}`, 303);
  });

  routes.post('/postpone', c => {
    const choice = c.get('form').course;
    let parts;
    try {
      parts = typeof choice === 'string' && choice.length <= 512 ? JSON.parse(choice) : null;
    } catch {
      parts = null;
    }
    const id = Array.isArray(parts) && parts.length === 2 && parts.every(part => typeof part === 'string')
      ? requestPostponement(db, c.get('studentId'), ...parts)
      : null;
    return id ? c.redirect(`/requests/${id}`, 303)
      : c.html(list(c, 'Выберите дисциплину из доступных для переноса.'), 422);
  });

  const missing = c => c.html(messagePage(
    'Заявка не найдена',
    'Такой заявки нет или она принадлежит другому студенту.',
    '/requests',
    'К моим заявкам',
    { student: c.get('student'), csrf: c.get('csrfToken'), active: 'requests' },
  ), 404);
  const detail = (c, request, feedback) => requestPage(
    request, c.get('csrfToken'), c.get('student'), feedback,
  );

  routes.get('/:id', c => {
    const request = requestForStudent(db, c.get('studentId'), idFrom(c.req.param('id')));
    return request ? c.html(detail(c, request)) : missing(c);
  });

  routes.post('/:id/clarifications/:cycleId/answer', c => {
    const id = idFrom(c.req.param('id'));
    const cycleId = idFrom(c.req.param('cycleId'));
    const { answer } = c.get('form');
    const outcome = answerClarification(db, c.get('studentId'), id, cycleId, answer);
    if (outcome === 'ok' || outcome === 'already') return c.redirect(`/requests/${id}`, 303);
    if (outcome === 'missing') return missing(c);

    const request = requestForStudent(db, c.get('studentId'), id);
    const message = outcome === 'stale'
      ? 'Этот вопрос уже закрыт. Проверьте, появилось ли новое уточнение.'
      : `Введите ответ длиной до ${clarificationLimit} знаков.`;
    const draft = outcome === 'invalid' && typeof answer === 'string' ? answer.slice(0, clarificationLimit) : '';
    return c.html(detail(c, request, { kind: outcome, message, answer: draft }), outcome === 'stale' ? 409 : 422);
  });

  return routes;
}
