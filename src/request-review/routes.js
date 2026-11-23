import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { messagePage } from '../ui/layout.js';
import { inboxRows, officeInbox, officeRequestPage } from './pages.js';

const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;

export function requestQueue(db) {
  const requests = modulesFor(db).get('requests');
  const pending = requests.officeRequests(db);
  return {
    count: pending.length,
    content: inboxRows(pending.slice(0, 5), 'Все заявки обработаны.', requests),
  };
}

export function officeRequestRoutes(db) {
  const routes = new Hono();
  const requests = modulesFor(db).get('requests');
  const { officeRequest, officeRequests, reviewRequest, askClarification, clarificationLimit } = requests;
  routes.get('/', c => {
    const requested = c.req.query('view');
    const view = ['waiting', 'closed'].includes(requested) ? requested : 'pending';
    return c.html(officeInbox(officeRequests(db, view), view, context(c), requests));
  });
  const missing = c => c.html(messagePage('Запись не найдена', 'Проверьте адрес или вернитесь к рабочему столу.',
    '/office', 'К рабочему столу', context(c)), 404);
  routes.get('/:id', c => {
    const request = officeRequest(db, idFrom(c.req.param('id')));
    return request ? c.html(officeRequestPage(request, context(c), requests)) : missing(c);
  });
  routes.post('/:id/clarify', c => {
    const id = idFrom(c.req.param('id'));
    const { question, cycle } = c.get('form');
    const outcome = askClarification(db, c.get('staff').id, id, question, cycle);
    if (outcome === 'ok') return c.redirect(`/office/requests/${id}`, 303);
    if (outcome === 'missing') return missing(c);
    const request = officeRequest(db, id);
    const error = outcome === 'stale'
      ? 'Заявка уже изменилась. Проверьте её статус и историю уточнений.'
      : `Введите вопрос длиной до ${clarificationLimit} знаков.`;
    const draft = typeof question === 'string' ? question.slice(0, clarificationLimit) : '';
    return c.html(officeRequestPage(request, context(c), requests, error, '', draft), outcome === 'stale' ? 409 : 422);
  });
  routes.post('/:id/review', c => {
    const id = idFrom(c.req.param('id'));
    const { action, comment, cycle } = c.get('form');
    const note = typeof comment === 'string' && comment.length <= 500 ? comment.trim() : '';
    const outcome = typeof comment !== 'undefined' && (typeof comment !== 'string' || comment.length > 500)
      ? 'invalid' : reviewRequest(db, c.get('staff').id, id, action, note, cycle);

    if (outcome === 'ok' || outcome === 'reviewed') return c.redirect(`/office/requests/${id}`, 303);
    const request = officeRequest(db, id);
    if (!request) return missing(c);
    const errors = {
      waiting: 'Дождитесь ответа студента, чтобы вынести решение.',
      stale: 'Заявка уже изменилась. Ознакомьтесь с последним ответом перед решением.',
      ineligible: 'У дисциплины появился результат или она больше не входит в план. Укажите причину и отклоните перенос.',
    };
    const error = errors[outcome] ?? 'Проверьте действие. Для отказа нужен комментарий до 500 знаков.';
    return c.html(officeRequestPage(request, context(c), requests, error, note), errors[outcome] ? 409 : 422);
  });
  return routes;
}
