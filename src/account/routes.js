import { Hono } from 'hono';
import { matchesPassword } from './passwords.js';
import { loginPage, profilePage } from './pages.js';

function preparedProfiles(db) {
  return db.prepare(`
    SELECT a.login, s.full_name, s.program, s.group_code
    FROM accounts a
    JOIN students s ON s.id = a.student_id
    WHERE a.login IN ('mira', 'mark')
    ORDER BY s.id
  `).all();
}

const invalidMessage = 'Проверьте логин и пароль и попробуйте ещё раз.';

export function publicAccountRoutes(db, session, { showProfiles = false } = {}) {
  const routes = new Hono();
  routes.get('/login', async c => {
    if (c.get('studentId')) return c.redirect('/', 303);
    if (!c.get('csrfToken')) await session.issue(c, null);
    const profiles = showProfiles ? preparedProfiles(db) : [];
    const requested = c.req.query('as');
    const selected = profiles.find(profile => profile.login === requested) ?? profiles[0] ?? null;
    return c.html(loginPage(c.get('csrfToken'), { profiles, selected }));
  });
  routes.post('/login', async c => {
    const form = c.get('form');
    const login = typeof form.login === 'string' ? form.login.trim().slice(0, 80) : '';
    const password = form.password;
    const account = db.prepare('SELECT * FROM accounts WHERE login = ?').get(login);
    if (typeof password !== 'string' || !password || password.length > 256 || !(await matchesPassword(account, password))) {
      const profiles = showProfiles ? preparedProfiles(db) : [];
      const selected = profiles.find(profile => profile.login === login) ?? null;
      return c.html(loginPage(c.get('csrfToken'), { profiles, selected, login, error: invalidMessage }), 401);
    }
    await session.issue(c, account.student_id);
    return c.redirect('/', 303);
  });
  return routes;
}

export function privateAccountRoutes(db, session) {
  const routes = new Hono();
  routes.get('/profile', c => {
    return c.html(profilePage(c.get('student'), c.get('csrfToken')));
  });
  routes.post('/logout', c => {
    session.logout(c);
    return c.redirect('/login', 303);
  });
  return routes;
}
