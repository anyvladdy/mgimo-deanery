import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { messagePage } from '../ui/layout.js';
import {
  appealHistory, availableNextLevel, configuredRecipients, createAppeal, destinations,
  eligibleRecipients, handleAppeal, setRecipient, staffAppeal, staffAppeals,
  studentAppeal, studentAppeals, studentDestinations,
} from './appeals.js';
import { appealPage, appealsPage, routingPage } from './pages.js';

const value = input => typeof input === 'string' ? input.trim() : '';
const idFrom = input => /^[1-9]\d*$/.test(input) && Number.isSafeInteger(Number(input)) ? Number(input) : 0;
const token = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const singleLine = /^[^\u0000-\u001f\u007f]+$/u;
const active = 'urgent-appeals';
const studentContext = c => ({ student: c.get('student'), csrf: c.get('csrfToken'), active });
const staffContext = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken'), active });

export function studentRoutes(db) {
  const routes = new Hono();
  const requests = modulesFor(db).get('requests');
  const missing = c => c.html(messagePage('Обращение или заявка не найдены', 'Откройте список своих обращений.',
    '/urgent-appeals', 'К обращениям', studentContext(c)), 404);
  const list = (c, context = {}, status = 200) => c.html(appealsPage(studentAppeals(db, c.get('studentId')), {
    ...studentContext(c), key: randomUUID(), choices: studentDestinations(db, c.get('student')), ...context,
  }), status);

  routes.get('/', c => {
    const source = c.req.query('request');
    const request = source === undefined ? null : requests.requestForStudent(db, c.get('studentId'), idFrom(source));
    return source !== undefined && !request ? missing(c) : list(c, { request });
  });
  routes.get('/:id', c => {
    const appeal = studentAppeal(db, c.get('studentId'), idFrom(c.req.param('id')));
    return appeal ? c.html(appealPage(appeal, appealHistory(db, appeal.id), studentContext(c))) : missing(c);
  });
  routes.post('/', c => {
    const form = c.get('form');
    const raw = { level: value(form.level), subject: value(form.subject), body: value(form.body), key: value(form.key) };
    const request = form.request ? requests.requestForStudent(db, c.get('studentId'), idFrom(form.request)) : null;
    if (form.request && !request) return missing(c);
    const draft = { level: raw.level, subject: raw.subject.slice(0, 150), body: raw.body.slice(0, 1500) };
    const invalid = (field, error) => list(c, { request, draft, error, field }, 422);
    if (!Object.hasOwn(destinations, raw.level)) return invalid('level', 'Выберите получателя.');
    if (!raw.subject || raw.subject.length > 150 || !singleLine.test(raw.subject)) return invalid('subject', 'Введите тему в одну строку, до 150 символов.');
    if (!raw.body || raw.body.length > 1500) return invalid('body', 'Опишите ситуацию и ожидаемое решение, до 1500 символов.');
    if (!token.test(raw.key)) return invalid('', 'Форма устарела. Повторите отправку.');
    const id = createAppeal(db, c.get('student'), { ...raw, requestId: request?.id ?? null });
    return id ? c.redirect(`/urgent-appeals/${id}`, 303)
      : list(c, { request, draft, field: 'level', error: 'Этот получатель сейчас недоступен. Выберите другого адресата.' }, 409);
  });
  return routes;
}

export function staffRoutes(db) {
  const routes = new Hono();
  const registry = modulesFor(db).get('registry');
  const routingPath = '/office/urgent-appeals/routing';
  const missing = c => c.html(messagePage('Обращение не найдено', 'Откройте назначенные вам обращения.',
    '/office/urgent-appeals', 'К обращениям', staffContext(c)), 404);
  const read = c => staffAppeal(db, c.get('staff').id, idFrom(c.req.param('id')));
  const render = (c, appeal, context = {}, status = 200) => c.html(appealPage(appeal,
    appealHistory(db, appeal.id), { ...staffContext(c), next: availableNextLevel(db, appeal), ...context }), status);
  const scopes = () => {
    const programs = registry.registryOverview(db);
    const faculties = [...new Set(programs.map(program => program.faculty))];
    return [['rector', ''], ...faculties.map(faculty => ['dean', faculty]), ...programs.map(program => ['program', program.name])];
  };
  const routing = (c, error = '', status = 200) => c.html(routingPage({
    scopes: scopes(), recipients: eligibleRecipients(db), configured: configuredRecipients(db),
    saved: c.req.query('saved') === '1', error,
  }, staffContext(c)), status);
  const restricted = c => c.html(messagePage('Требуются права администратора', 'Получателей назначает администратор кабинета.',
    '/office/urgent-appeals', 'К обращениям', staffContext(c)), 403);

  routes.get('/', c => c.html(appealsPage(staffAppeals(db, c.get('staff').id), {
    ...staffContext(c), forwarded: c.req.query('forwarded') === '1',
  })));
  routes.get('/routing', c => c.get('staff').role === 'admin' ? routing(c) : restricted(c));
  routes.post('/routing', c => {
    if (c.get('staff').role !== 'admin') return restricted(c);
    const form = c.get('form');
    const destination = scopes().find(row => JSON.stringify(row) === form.destination);
    if (!destination || !idFrom(form.recipient) || !setRecipient(db, ...destination, idFrom(form.recipient))) {
      return routing(c, 'Выберите подразделение и действующего получателя.', 422);
    }
    return c.redirect(`${routingPath}?saved=1`, 303);
  });
  routes.get('/:id', c => {
    const appeal = read(c);
    return appeal ? render(c, appeal) : missing(c);
  });
  routes.post('/:id/handle', c => {
    const appeal = read(c);
    if (!appeal) return missing(c);
    const form = c.get('form');
    const action = form.action;
    const response = value(form.response);
    const version = idFrom(form.version);
    if (!version || !['forward', 'resolve'].includes(action) || (action === 'resolve' && (!response || response.length > 1500))) {
      return render(c, appeal, { error: 'Для ответа введите текст до 1500 символов.', draft: response.slice(0, 1500) }, 422);
    }
    const result = handleAppeal(db, c.get('staff').id, appeal.id, { action, version, response });
    if (result === 'missing') return missing(c);
    if (result !== 'ok') return render(c, read(c) ?? appeal, {
      error: result === 'stale' ? 'Обращение обновилось. Проверьте его состояние.' : 'Следующий получатель сейчас недоступен.',
    }, 409);
    return c.redirect(action === 'forward' ? '/office/urgent-appeals?forwarded=1' : `/office/urgent-appeals/${appeal.id}`, 303);
  });
  return routes;
}
