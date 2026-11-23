import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serve } from '@hono/node-server';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openAppDatabase } from './db/open.js';
import { sessions, requireStudent } from './account/sessions.js';
import { publicAccountRoutes, privateAccountRoutes } from './account/routes.js';
import { modulesFor } from './modules/config.js';
import { demoNow, runningDemoClock, schoolDayAt, schoolNow, withSchoolClock } from './modules/clock.js';
import { homeRoutes } from './home/routes.js';
import { studentServiceRoutes } from './ui/services.js';
import { messagePage, withModules, withTheme } from './ui/layout.js';
import { designLoader, designLoaderIntegrity, fullStylesheet, presentationVariant, savePresentation, withPresentation } from './ui/presentation.js';

const css = readFileSync(new URL('./ui/site.css', import.meta.url), 'utf8');

const activityPaths = [
  [/^\/requests(?:$|\/postpone$|\/\d+\/clarifications\/\d+\/answer$)/, 'request'],
  [/^\/(?:notices\/read|read\/\d+)$/, 'notice'],
  [/^\/messages(?:$|\/\d+\/reply$)/, 'message'],
  [/^\/plan\/\d+\/(?:choice|withdraw)$/, 'course'],
  [/^\/events\/\d+\/register$/, 'event', 'register'],
  [/^\/events\/\d+\/cancel$/, 'event', 'cancel'],
  [/^\/room-booking$/, 'booking', 'create'],
  [/^\/room-booking\/\d+\/cancel$/, 'booking', 'cancel'],
  [/^\/deadlines$/, 'deadline', 'create'],
  [/^\/deadlines\/\d+\/complete$/, 'deadline', 'complete'],
  [/^\/deadlines\/\d+\/delete$/, 'deadline', 'delete'],
  [/^\/settings\/theme$/, 'theme'],
  [/^\/integrations\/token$/, 'integration', 'issue'],
  [/^\/integrations\/revoke$/, 'integration', 'revoke'],
];

export function createApp(db, { secret, secure = false, now = demoNow }) {
  const app = new Hono();
  const modules = modulesFor(db);
  const session = sessions(db, secret, secure);
  const theme = modules.get('theme');
  const activity = modules.get('activity');
  const services = modules.navigation('studentServices');
  const currentSchoolDay = () => schoolDayAt(schoolNow());
  const context = { db, session, currentSchoolDay };
  const officeMounts = modules.has('office') ? [...modules.entries()]
    .flatMap(module => module.staffMount ? [module.staffMount(context)] : [])
    .sort((left, right) => (left.order ?? 100) - (right.order ?? 100)) : [];
  const mount = (property, options) => {
    for (const module of modules.entries()) {
      if (module[property]) app.route(...module[property](options));
    }
  };
  const sameToken = (left, right) => {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  };
  const formFailure = (c, title, message, status) => {
    const staff = c.get('staff');
    const signedIn = Boolean(c.get('studentId'));
    const staffForm = modules.has('office') && c.req.path.startsWith('/office/');
    return c.html(messagePage(title, message,
      staff ? '/office' : signedIn ? '/' : staffForm ? '/office/login' : '/login',
      staff ? 'К рабочему столу' : signedIn ? 'На главную' : 'Вернуться ко входу',
      { staff, staffMode: staffForm, csrf: c.get('csrfToken') }), status);
  };
  app.onError((error, c) => {
    console.error('Ошибка запроса:', error.message);
    const staff = c.get('staff');
    const signedIn = Boolean(c.get('studentId'));
    return c.html(messagePage('Не удалось выполнить действие', 'Повторите попытку. Если ошибка повторится, вернитесь на главную.',
      staff ? '/office' : signedIn ? '/' : '/login',
      staff ? 'К рабочему столу' : signedIn ? 'На главную' : 'Вернуться ко входу',
      { staff, csrf: c.get('csrfToken') }), 500);
  });
  app.use('*', withPresentation);
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'same-origin');
    c.header('X-Content-Type-Options', 'nosniff');
    const scripts = presentationVariant() === 'auto' ? `'${designLoaderIntegrity}'` : "'none'";
    c.header('Content-Security-Policy', `default-src 'self'; script-src ${scripts}; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    if (secure) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    await next();
  });
  app.get('/assets/site.css', c => c.body(css, 200, { 'Content-Type': 'text/css; charset=utf-8' }));
  app.get('/assets/carbon.css', c => c.body(fullStylesheet, 200, {
    'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=3600',
  }));
  app.get('/assets/design.js', c => c.body(designLoader, 200, {
    'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600',
  }));
  app.get('/health', c => c.text('ok'));
  app.use('*', (_, next) => withSchoolClock(now, () => withModules(modules, next)));
  app.use('*', session.load);
  const ordinaryForm = bodyLimit({ maxSize: 16 * 1024 });
  const staffFormLimits = officeMounts.filter(mount => mount.maxBodyBytes).map(mount => ({
    prefix: `/office${mount.path}/`,
    limit: bodyLimit({ maxSize: mount.maxBodyBytes }),
  }));
  app.use('*', (c, next) => {
    const form = staffFormLimits.find(item => c.req.path.startsWith(item.prefix));
    return (form?.limit ?? ordinaryForm)(c, next);
  });
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
  app.post('/settings/design', c => savePresentation(c, secure));
  app.route('/', publicAccountRoutes(db, session));
  mount('publicMount', { ...context, officeMounts });
  app.use('*', requireStudent);
  app.use('*', async (c, next) => {
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(c.get('studentId'));
    if (!student) {
      session.logout(c);
      return c.redirect('/login', 303);
    }
    c.set('student', student);
    const [, kind, action] = activity && c.req.method === 'POST'
      ? activityPaths.find(([pattern]) => pattern.test(c.req.path)) ?? [] : [];
    const page = theme && c.req.method === 'GET' ? new URL(c.req.url) : null;
    const preference = theme ? {
      theme: theme.themeForStudent(db, student.id),
      returnTo: page ? page.pathname + page.search : '',
    } : null;
    await withTheme(preference, next);
    if (kind && [200, 201, 204, 303].includes(c.res.status)) {
      try {
        activity.recordActivity(db, student.id, kind, action);
      } catch (error) {
        console.error('Журнал действий:', error.message);
      }
    }
  });
  if (services.length) app.route('/services', studentServiceRoutes(services));
  app.route('/', privateAccountRoutes(db, session));
  app.route('/', homeRoutes(db, currentSchoolDay));
  mount('studentMount', context);
  app.notFound(c => c.html(messagePage(
    'Страница не найдена',
    'Раздел может быть отключён. Доступные разделы есть в меню кабинета.',
    '/',
    'На главную',
    { student: c.get('student'), csrf: c.get('csrfToken') },
  ), 404));
  return app;
}

export function startServer({ filename, modules, now = runningDemoClock(), defaultPort = 3000, onListen } = {}) {
  const secure = process.env.NODE_ENV === 'production';
  const clock = process.env.SCHOOL_CLOCK === 'real' ? () => new Date() : now;
  const secret = process.env.SESSION_SECRET ?? (secure ? undefined : randomBytes(32).toString('hex'));
  const db = openAppDatabase(filename, { modules });
  let app;
  try {
    const suspended = modulesFor(db).suspended;
    if (suspended.length) console.warn(`Модули без доступных зависимостей: ${suspended.join(', ')}.`);
    app = createApp(db, { secret, secure, now: clock });
  } catch (error) {
    db.close();
    throw error;
  }
  const hostname = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? defaultPort);
  const server = serve({ fetch: app.fetch, hostname, port }, info => {
    onListen?.();
    console.log(`Деканат: http://${hostname}:${info.port}`);
  });
  server.once('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
