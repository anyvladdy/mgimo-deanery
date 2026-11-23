import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { messagePage } from '../ui/layout.js';
import { listRequests, requestForStudent, createCertificateRequest, postponableCourses, requestPostponement, answerClarification, clarificationLimit, certificateKind, readyStatus } from './requests.js';
import { certificateForStudent, certificatePrint } from './certificates.js';
import { requestsPage, requestPage } from './pages.js';

function idFrom(value) {
  const id = /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function requestRoutes(db) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const hasPostponements = modules.has('postponements');
  const list = (c, error = '') => requestsPage(
    listRequests(db, c.get('studentId')), hasPostponements ? postponableCourses(db, c.get('studentId')) : null,
    c.get('csrfToken'), c.get('student'), error,
  );

  routes.get('/', c => c.html(list(c)));

  routes.post('/', c => {
    const id = createCertificateRequest(db, c.get('studentId'));
    return c.redirect(`/requests/${id}`, 303);
  });

  if (hasPostponements) routes.post('/postpone', c => {
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
  const detail = (c, request, feedback, certificate) => requestPage(
    request, c.get('csrfToken'), c.get('student'), feedback, modules.has('messages'), certificate, modules.has('urgent-appeals'),
  );

  routes.get('/:id', c => {
    const request = requestForStudent(db, c.get('studentId'), idFrom(c.req.param('id')));
    if (!request) return missing(c);
    const certificate = request.kind === certificateKind && request.status === readyStatus
      ? certificateForStudent(db, request.id, c.get('studentId')) : null;
    return c.html(detail(c, request, null, certificate));
  });

  routes.get('/:id/print', c => {
    const id = idFrom(c.req.param('id'));
    const certificate = certificateForStudent(db, id, c.get('studentId'));
    return certificate ? c.html(certificatePrint(id, certificate, c.get('student'), c.get('csrfToken'))) : missing(c);
  });

  if (modules.has('request-review')) routes.post('/:id/clarifications/:cycleId/answer', c => {
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
