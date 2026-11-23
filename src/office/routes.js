import { Hono } from 'hono';
import { matchesPassword } from '../account/passwords.js';
import { beginLoginAttempt } from '../account/login-throttle.js';
import { messagePage } from '../ui/layout.js';
import { modulesFor } from '../modules/config.js';
import { officeLogin, officeHome, officeDirectory, officeStudent, teacherHome } from './pages.js';

const officeRoles = new Set(['office', 'admin']);
const staffRoles = new Set([...officeRoles, 'teacher', 'leadership']);
const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
const cleanQuery = value => String(value ?? '').trim().slice(0, 100);
const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;

export function officeRoutes(db, session, officeMounts = []) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const teacherMounts = officeMounts.filter(mount => mount.teachers);
  const leadershipMounts = officeMounts.filter(mount => mount.leadership);
  const leadershipLanding = leadershipMounts[0] ? `/office${leadershipMounts[0].path}` : '/office';
  const teacherLanding = teacherMounts[0] ? `/office${teacherMounts[0].path}` : '/office';
  const registry = modules.get('registry');
  const plan = modules.get('plan');
  const cards = [
    { path: '/students', label: 'Контингент', description: plan
      ? 'Студенты, программы и индивидуальные планы' : 'Студенты и группы', order: 40 },
    ...officeMounts.filter(mount => mount.dashboard).map(mount => ({ ...mount.dashboard, path: mount.path })),
  ].sort((left, right) => left.order - right.order);
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
  const unavailable = c => {
    const leader = c.get('staff').role === 'leadership';
    return c.html(messagePage('Раздел учебного офиса', 'Откройте доступный вам раздел кабинета.',
      leader ? leadershipLanding : teacherLanding,
      leader ? 'К кабинету руководителя' : 'К кабинету преподавателя', context(c)), 403);
  };
  for (const mount of officeMounts.filter(mount => mount.teachers || mount.leadership)) {
    const scoped = new Hono();
    scoped.use('*', (c, next) => {
      const { role } = c.get('staff');
      const allowed = officeRoles.has(role) || (role === 'teacher' && mount.teachers)
        || (role === 'leadership' && mount.leadership);
      return allowed ? next() : unavailable(c);
    });
    scoped.route('/', mount.routes);
    routes.route(mount.path, scoped);
  }
  routes.get('/', c => {
    if (c.get('staff').role === 'leadership') {
      return leadershipMounts.length ? c.redirect(leadershipLanding, 303)
        : c.html(messagePage('Кабинет руководителя', 'Разделы для руководителей сейчас отключены.',
          '/office/login', 'Ко входу', context(c)));
    }
    if (c.get('staff').role === 'teacher') {
      if (teacherMounts.length) return c.redirect(teacherLanding, 303);
      return c.html(teacherHome(context(c)));
    }
    const totals = db.prepare('SELECT COUNT(*) AS students, COUNT(DISTINCT group_code) AS groups FROM students').get();
    const pending = modules.get('request-review')?.requestQueue(db);
    const recoveries = modules.get('recovery')?.pendingRecoveries(db) ?? 0;
    return c.html(officeHome({ ...totals, recoveries }, pending, cards, context(c)));
  });
  routes.use('*', (c, next) => officeRoles.has(c.get('staff').role) ? next() : unavailable(c));
  const missing = c => c.html(messagePage('Запись не найдена', 'Проверьте адрес или вернитесь к рабочему столу.',
    '/office', 'К рабочему столу', context(c)), 404);
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
    return c.html(officeDirectory(rows, { groups, search, group, page, total: roster.length }, context(c), Boolean(registry)));
  });
  routes.get('/students/:id', c => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(idFrom(c.req.param('id')));
    if (!student) return missing(c);
    return c.html(officeStudent(student, plan?.planForStudent(db, student.id), context(c), {
      history: registry?.movementHistory(registry.movementsForStudent(db, student.id), true),
      registryEnabled: Boolean(registry),
      nameUpdated: registry && c.req.query('updated') === 'name',
    }));
  });
  for (const mount of officeMounts.filter(mount => !mount.teachers && !mount.leadership)) routes.route(mount.path, mount.routes);
  routes.all('*', c => c.html(messagePage('Страница не найдена',
    'Раздел может быть отключён. Доступные разделы есть в меню учебного офиса.',
    '/office', 'К рабочему столу', context(c)), 404));
  return routes;
}
