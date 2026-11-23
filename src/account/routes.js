import { Hono } from 'hono';
import { matchesPassword } from './passwords.js';
import { beginLoginAttempt } from './login-throttle.js';
import { loginPage, profilePage } from './pages.js';
import { movementsForStudent } from '../registry/registry.js';

const invalidMessage = 'Проверьте логин и пароль и попробуйте ещё раз.';
const blockedMessage = 'Слишком много неверных попыток. Подождите несколько минут и повторите вход.';

export function publicAccountRoutes(db, session) {
  const routes = new Hono();
  routes.get('/login', async c => {
    if (c.get('staff')) return c.redirect('/office', 303);
    if (c.get('studentId')) return c.redirect('/', 303);
    if (!c.get('csrfToken')) await session.issue(c, null);
    return c.html(loginPage(c.get('csrfToken')));
  });
  routes.post('/login', async c => {
    const form = c.get('form');
    const login = typeof form.login === 'string' ? form.login.trim().slice(0, 80) : '';
    const password = form.password;
    const complete = beginLoginAttempt('student', login);
    if (!complete) {
      return c.html(loginPage(c.get('csrfToken'), { login, error: blockedMessage }), 429);
    }
    let account;
    let valid = false;
    try {
      account = db.prepare('SELECT * FROM accounts WHERE login = ?').get(login);
      valid = typeof password === 'string' && password.length > 0 && password.length <= 256
        && await matchesPassword(account, password);
    } finally {
      complete(valid);
    }
    if (!valid) {
      return c.html(loginPage(c.get('csrfToken'), { login, error: invalidMessage }), 401);
    }
    await session.issue(c, account.student_id);
    return c.redirect('/', 303);
  });
  return routes;
}

export function privateAccountRoutes(db, session) {
  const routes = new Hono();
  routes.get('/profile', c => {
    return c.html(profilePage(c.get('student'), c.get('csrfToken'), movementsForStudent(db, c.get('studentId'))));
  });
  routes.post('/logout', c => {
    session.logout(c);
    return c.redirect('/login', 303);
  });
  return routes;
}
