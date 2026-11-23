import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openAppDatabase } from './db/open.js';
import { sessions, requireStudent } from './account/sessions.js';
import { publicAccountRoutes, privateAccountRoutes } from './account/routes.js';
import { requestRoutes } from './requests/routes.js';
import { demoNow, schoolDayAt } from './schedule/clock.js';
import { scheduleRoutes } from './schedule/routes.js';
import { gradesRoutes } from './grades/routes.js';
import { homeRoutes } from './home/routes.js';
import { planRoutes } from './plan/routes.js';
import { officeRoutes } from './office/routes.js';
import { syllabusRoutes } from './syllabus/routes.js';
import { noticeRoutes } from './notices/routes.js';
import { messagePage } from './ui/layout.js';

const css = readFileSync(new URL('./ui/site.css', import.meta.url), 'utf8');

export function createApp(db, { secret, secure = false, now = demoNow }) {
  const app = new Hono();
  const session = sessions(db, secret, secure);
  const currentSchoolDay = () => schoolDayAt(now());
  const sameToken = (left, right) => {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  };
  const formFailure = (c, title, message, status) => {
    const staff = c.get('staff');
    const signedIn = Boolean(c.get('studentId'));
    const staffForm = c.req.path.startsWith('/office/');
    return c.html(messagePage(title, message,
      staff ? '/office' : signedIn ? '/' : staffForm ? '/office/login' : '/login',
      staff ? 'К рабочему столу' : signedIn ? 'Открыть «Сегодня»' : 'Вернуться ко входу',
      { staff, staffMode: staffForm, csrf: c.get('csrfToken') }), status);
  };
  app.onError((error, c) => {
    console.error('Ошибка запроса:', error.message);
    const staff = c.get('staff');
    const signedIn = Boolean(c.get('studentId'));
    return c.html(messagePage('Не удалось выполнить действие', 'Повторите попытку. Если ошибка повторится, вернитесь на главную.',
      staff ? '/office' : signedIn ? '/' : '/login',
      staff ? 'К рабочему столу' : signedIn ? 'Открыть «Сегодня»' : 'Вернуться ко входу',
      { staff, csrf: c.get('csrfToken') }), 500);
  });
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (secure) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    await next();
  });
  app.get('/assets/site.css', c => c.body(css, 200, { 'Content-Type': 'text/css; charset=utf-8' }));
  app.get('/health', c => c.text('ok'));
  app.use('*', session.load);
  const ordinaryForm = bodyLimit({ maxSize: 16 * 1024 });
  const syllabusForm = bodyLimit({ maxSize: 40 * 1024 });
  app.use('*', (c, next) => (c.req.path.startsWith('/office/syllabuses/') ? syllabusForm : ordinaryForm)(c, next));
  app.use('*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      let body;
      try {
        body = await c.req.parseBody();
      } catch {
        return formFailure(c, 'Форма не прочитана', 'Обновите страницу и отправьте форму ещё раз.', 400);
      }
      if (!c.get('csrfToken') || !sameToken(body._csrf, c.get('csrfToken'))) {
        return formFailure(c, 'Форма устарела', 'Откройте страницу ещё раз и повторите действие.', 403);
      }
      c.set('form', body);
    }
    await next();
  });
  app.route('/', publicAccountRoutes(db, session));
  app.route('/office', officeRoutes(db, session));
  app.use('*', requireStudent);
  app.use('*', async (c, next) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(c.get('studentId'));
    if (!student) {
      session.logout(c);
      return c.redirect('/login', 303);
    }
    c.set('student', student);
    await next();
  });
  app.route('/', privateAccountRoutes(db, session));
  app.route('/', homeRoutes(db, currentSchoolDay));
  app.route('/requests', requestRoutes(db));
  app.route('/schedule', scheduleRoutes(db, currentSchoolDay));
  app.route('/grades', gradesRoutes(db));
  app.route('/plan', planRoutes(db));
  app.route('/syllabuses', syllabusRoutes(db));
  app.route('/notices', noticeRoutes(db, currentSchoolDay));
  app.notFound(c => c.html(messagePage(
    'Страница не найдена',
    'Проверьте адрес страницы.',
    '/',
    'Открыть «Сегодня»',
    { student: c.get('student'), csrf: c.get('csrfToken') },
  ), 404));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secure = process.env.NODE_ENV === 'production';
  const now = process.env.SCHOOL_CLOCK === 'real' ? () => new Date() : demoNow;
  const secret = process.env.SESSION_SECRET ?? (secure ? undefined : randomBytes(32).toString('hex'));
  const db = openAppDatabase();
  const app = createApp(db, { secret, secure, now });
  const hostname = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, hostname, port }, info => console.log(`Деканат: http://${hostname}:${info.port}`));
}
