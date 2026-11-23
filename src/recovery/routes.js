import { Hono } from 'hono';
import { beginLoginAttempt } from '../account/login-throttle.js';
import { messagePage } from '../ui/layout.js';
import { recoveryRequestPage, recoveryCodePage, officeRecoveryPage, recoveryCodeReceipt } from './pages.js';
import { recoveryQueue, requestRecovery, resetPassword, reviewRecovery } from './recovery.js';

const loginField = value => typeof value === 'string' && value.trim().length <= 80 ? value.trim() : '';
const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;

export function publicRecoveryRoutes(db, session) {
  const routes = new Hono();
  routes.use('*', async (c, next) => {
    if (c.get('staff')) return c.redirect('/office', 303);
    if (c.get('studentId')) return c.redirect('/', 303);
    if (c.req.method === 'GET' && !c.get('csrfToken')) await session.issue(c, null);
    await next();
  });
  routes.get('/', c => c.html(recoveryRequestPage(c.get('csrfToken'), { sent: c.req.query('sent') === '1' })));
  routes.post('/', c => {
    const login = loginField(c.get('form').login);
    if (!login) return c.html(recoveryRequestPage(c.get('csrfToken'), { error: 'Введите свой логин.' }), 422);
    requestRecovery(db, login);
    return c.redirect('/recover?sent=1', 303);
  });
  routes.get('/complete', c => c.html(recoveryCodePage(c.get('csrfToken'), { done: c.req.query('done') === '1' })));
  routes.post('/complete', async c => {
    const form = c.get('form');
    const login = loginField(form.login);
    const code = typeof form.code === 'string' && form.code.length <= 40 ? form.code.replace(/[ -]/g, '').toLowerCase() : '';
    const showError = (error, field = 'code', status = 422) => c.html(recoveryCodePage(c.get('csrfToken'), { login, error, field }), status);
    if (!login) return showError('Введите свой логин.', 'login');
    if (!/^[a-f\d]{20}$/.test(code)) return showError('Введите код, который передал сотрудник.');
    const { password, confirmation } = form;
    if (typeof password !== 'string' || password.trim().length < 10 || password.length > 256) {
      return showError('Введите пароль длиной от 10 до 256 символов.', 'password');
    }
    if (password !== confirmation) return showError('Повторите новый пароль без изменений.', 'confirmation');
    const complete = beginLoginAttempt('recovery', login);
    if (!complete) return showError('Слишком много попыток. Подождите несколько минут.', 'code', 429);
    let changed = false;
    try {
      changed = await resetPassword(db, login, code, password);
    } finally {
      complete(changed);
    }
    if (!changed) return showError('Код недействителен. Проверьте логин и код или отправьте новый запрос.');
    return c.redirect('/recover/complete?done=1', 303);
  });
  return routes;
}

export function officeRecoveryRoutes(db) {
  const routes = new Hono();
  const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
  const queue = (c, error = '', status = 200) => c.html(officeRecoveryPage(recoveryQueue(db), context(c), error), status);
  routes.get('/', c => queue(c));
  routes.post('/:id', c => {
    const { action } = c.get('form');
    if (action !== 'approve' && action !== 'reject') return queue(c, 'Выберите решение по запросу.', 422);
    const result = reviewRecovery(db, idFrom(c.req.param('id')), c.get('staff').id, action);
    if (result.status === 'missing') return c.html(messagePage('Запрос не найден', 'Откройте список запросов.',
      '/office/recovery', 'К запросам', context(c)), 404);
    if (result.status === 'reviewed') return queue(c, 'Этот запрос уже рассмотрен.', 409);
    return result.code ? c.html(recoveryCodeReceipt(result, context(c))) : c.redirect('/office/recovery', 303);
  });
  return routes;
}
