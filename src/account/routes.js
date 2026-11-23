import { Hono } from 'hono';
import { matchesPassword } from './passwords.js';
import { beginLoginAttempt } from './login-throttle.js';
import { loginPage, profilePage } from './pages.js';
import { modulesFor } from '../modules/config.js';

const invalidMessage = 'Проверьте логин и пароль и попробуйте ещё раз.';
const blockedMessage = 'Слишком много неверных попыток. Подождите несколько минут и повторите вход.';

export function publicAccountRoutes(db, session) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const recovery = modules.has('recovery');
  const activity = modules.get('activity');
  const studyTools = ['schedule', 'grades', 'requests'].every(id => modules.has(id));
  routes.get('/login', async c => {
    if (c.get('staff')) return c.redirect('/office', 303);
    if (c.get('studentId')) return c.redirect('/', 303);
    if (!c.get('csrfToken')) await session.issue(c, null);
    return c.html(loginPage(c.get('csrfToken'), { recovery, studyTools }));
  });
  routes.post('/login', async c => {
    const form = c.get('form');
    const login = typeof form.login === 'string' ? form.login.trim().slice(0, 80) : '';
    const password = form.password;
    const complete = beginLoginAttempt('student', login);
    if (!complete) {
      return c.html(loginPage(c.get('csrfToken'), { login, error: blockedMessage, recovery, studyTools }), 429);
    }
    let account;
    let valid = false;
    try {
      account = db.prepare('SELECT * FROM accounts WHERE login = ?').get(login);
      valid = typeof password === 'string' && password.length > 0 && password.length <= 256
        && await matchesPassword(account, password);
      if (valid) valid = await session.issue(c, account.student_id, { expectedPasswordHash: account.password_hash });
    } finally {
      complete(valid);
    }
    if (!valid) {
      return c.html(loginPage(c.get('csrfToken'), { login, error: invalidMessage, recovery, studyTools }), 401);
    }
    try {
      activity?.recordActivity(db, account.student_id, 'login');
    } catch (error) {
      console.error('Журнал действий:', error.message);
    }
    return c.redirect('/', 303);
  });
  return routes;
}

export function privateAccountRoutes(db, session) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const registry = modules.get('registry');
  const profileActions = modules.navigation('studentServices')
    .filter(([href]) => href === '/student-card');
  routes.get('/profile', c => {
    const history = registry?.movementHistory(registry.movementsForStudent(db, c.get('studentId')));
    return c.html(profilePage(c.get('student'), c.get('csrfToken'), history, profileActions));
  });
  routes.post('/logout', c => {
    session.logout(c);
    return c.redirect('/login', 303);
  });
  return routes;
}
