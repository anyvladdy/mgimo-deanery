import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openAppDatabase } from './db/open.js';
import { sessions, requireStudent } from './account/sessions.js';
import { publicAccountRoutes, privateAccountRoutes } from './account/routes.js';
import { requestRoutes } from './requests/routes.js';
import { scheduleRoutes } from './schedule/routes.js';
import { gradesRoutes } from './grades/routes.js';
import { homeRoutes } from './home/routes.js';
import { messagePage } from './ui/layout.js';

const css = readFileSync(new URL('./ui/site.css', import.meta.url), 'utf8');

export function createApp(db, { secret, secure = false, showProfiles = false }) {
  const app = new Hono();
  const session = sessions(db, secret, secure);
  app.get('/assets/site.css', c => c.body(css, 200, { 'Content-Type': 'text/css; charset=utf-8' }));
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    await next();
  });
  app.get('/health', c => c.text('ok'));
  app.use('*', session.load);
  app.use('*', bodyLimit({ maxSize: 16 * 1024 }));
  app.use('*', async (c, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const body = await c.req.parseBody();
      if (!c.get('csrfToken') || body._csrf !== c.get('csrfToken')) {
        const signedIn = Boolean(c.get('studentId'));
        return c.html(messagePage('Форма устарела', 'Откройте страницу ещё раз и повторите действие.',
          signedIn ? '/' : '/login', signedIn ? 'Открыть «Сегодня»' : 'Вернуться ко входу'), 403);
      }
      c.set('form', body);
    }
    await next();
  });
  app.route('/', publicAccountRoutes(db, session, { showProfiles }));
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
  app.route('/', homeRoutes(db));
  app.route('/requests', requestRoutes(db));
  app.route('/schedule', scheduleRoutes(db));
  app.route('/grades', gradesRoutes(db));
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
  const showProfiles = process.env.DEMO_PROFILES === '1';
  const secret = process.env.SESSION_SECRET ?? (secure ? undefined : randomBytes(32).toString('hex'));
  const db = openAppDatabase();
  const app = createApp(db, { secret, secure, showProfiles });
  const hostname = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, hostname, port }, info => console.log(`Деканат: http://${hostname}:${info.port}`));
}
