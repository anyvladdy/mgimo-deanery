import { Hono } from 'hono';
import { matchesPassword } from '../account/passwords.js';
import { beginLoginAttempt } from '../account/login-throttle.js';
import { messagePage } from '../ui/layout.js';
import { officeRequest, officeRequests, reviewRequest, askClarification, clarificationLimit } from '../requests/requests.js';
import { officeSyllabusRoutes } from '../syllabus/routes.js';
import { gradebookRoutes } from '../gradebook/routes.js';
import { registryRoutes } from '../registry/routes.js';
import { curriculumRoutes } from '../curriculum/routes.js';
import { roomPublicationRoutes } from '../room-publication/routes.js';
import { movementsForStudent } from '../registry/registry.js';
import { planForStudent } from '../plan/plan.js';
import { officeLogin, officeHome, officeDirectory, officeStudent, officeInbox, officeRequestPage } from './pages.js';

const officeRoles = new Set(['office', 'admin']);
const staffRoles = new Set([...officeRoles, 'teacher']);
const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
const cleanQuery = value => String(value ?? '').trim().slice(0, 100);
const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;

export function officeRoutes(db, session) {
  const routes = new Hono();
  routes.get('/login', async c => {
    if (c.get('staff')) return c.redirect('/office', 303);
    if (!c.get('csrfToken')) await session.issue(c, null);
    return c.html(officeLogin(c.get('csrfToken')));
  });
  routes.post('/login', async c => {
    const form = c.get('form');
    const login = typeof form.login === 'string' ? form.login.trim().slice(0, 80) : '';
    const password = form.password;
    const complete = beginLoginAttempt('office', login);
    if (!complete) {
      return c.html(officeLogin(c.get('csrfToken'), login, 'Слишком много неверных попыток. Подождите несколько минут.'), 429);
    }
    let account;
    let valid = false;
    try {
      const candidate = db.prepare('SELECT * FROM staff_accounts WHERE login = ? AND active = 1').get(login);
      account = candidate && staffRoles.has(candidate.role) ? candidate : undefined;
      valid = typeof password === 'string' && password.length > 0 && password.length <= 256
        && await matchesPassword(account, password);
    } finally {
      complete(valid);
    }
    if (!valid) {
      return c.html(officeLogin(c.get('csrfToken'), login, 'Проверьте логин и пароль сотрудника.'), 401);
    }
    await session.issue(c, null, { staffId: account.id });
    return c.redirect('/office', 303);
  });

  routes.use('*', async (c, next) => {
    if (!c.get('staff') && !c.get('studentId')) return c.redirect('/office/login', 303);
    if (!staffRoles.has(c.get('staff')?.role)) {
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(c.get('studentId') ?? 0);
      return c.html(messagePage('Раздел для сотрудников', 'Войдите в учётную запись учебного офиса.',
        '/office/login', 'Вход для сотрудника', { student, csrf: c.get('csrfToken') }), 403);
    }
    await next();
  });
  routes.post('/logout', c => {
    session.logout(c);
    return c.redirect('/office/login', 303);
  });
  routes.route('/gradebook', gradebookRoutes(db));
  routes.get('/', c => {
    if (c.get('staff').role === 'teacher') return c.redirect('/office/gradebook', 303);
    const totals = db.prepare('SELECT COUNT(*) AS students, COUNT(DISTINCT group_code) AS groups FROM students').get();
    const pending = officeRequests(db);
    return c.html(officeHome(totals, pending, context(c)));
  });
  routes.use('*', async (c, next) => {
    if (!officeRoles.has(c.get('staff').role)) {
      return c.html(messagePage('Раздел учебного офиса', 'Преподавателю доступны ведомости назначенных дисциплин.',
        '/office/gradebook', 'К ведомостям', context(c)), 403);
    }
    await next();
  });
  routes.get('/requests', c => {
    const requested = c.req.query('view');
    const view = ['waiting', 'closed'].includes(requested) ? requested : 'pending';
    return c.html(officeInbox(officeRequests(db, view), view, context(c)));
  });
  const missing = c => c.html(messagePage('Запись не найдена', 'Проверьте адрес или вернитесь к рабочему столу.',
    '/office', 'К рабочему столу', context(c)), 404);
  routes.get('/requests/:id', c => {
    const request = officeRequest(db, idFrom(c.req.param('id')));
    return request ? c.html(officeRequestPage(request, context(c))) : missing(c);
  });
  routes.post('/requests/:id/clarify', c => {
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
    return c.html(officeRequestPage(request, context(c), error, '', draft), outcome === 'stale' ? 409 : 422);
  });
  routes.post('/requests/:id/review', c => {
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
    return c.html(officeRequestPage(request, context(c), error, note), errors[outcome] ? 409 : 422);
  });
  routes.get('/students', c => {
    const search = cleanQuery(c.req.query('q'));
    const group = cleanQuery(c.req.query('group'));
    const groups = db.prepare('SELECT DISTINCT group_code FROM students ORDER BY group_code').all().map(row => row.group_code);
    const roster = db.prepare(`
      SELECT id, full_name, program, year, group_code FROM students
      WHERE ? = '' OR group_code = ?
      ORDER BY full_name
    `).all(group, group).filter(row => row.full_name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
    const page = Math.max(1, Math.min(idFrom(c.req.query('page')) || 1, Math.ceil(roster.length / 30)));
    const rows = roster.slice((page - 1) * 30, page * 30);
    return c.html(officeDirectory(rows, { groups, search, group, page, total: roster.length }, context(c)));
  });
  routes.get('/students/:id', c => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(idFrom(c.req.param('id')));
    if (!student) return missing(c);
    return c.html(officeStudent(student, planForStudent(db, student.id), movementsForStudent(db, student.id), context(c)));
  });
  routes.route('/schedule', roomPublicationRoutes(db));
  routes.route('/registry', registryRoutes(db));
  routes.route('/curriculum', curriculumRoutes(db));
  routes.route('/syllabuses', officeSyllabusRoutes(db));
  routes.all('*', missing);
  return routes;
}
