import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { seedDemoData } from '../demo/seed.js';
import { passwordRecord } from '../src/account/passwords.js';
import { openDatabase } from '../src/db/open.js';
import { resolveModules } from '../src/modules/catalog.js';
import { createApp } from '../src/server.js';

const password = 'fixture-password';
const { salt, hash } = await passwordRecord(password);
const source = readFileSync(new URL('../src/ui/design-loader.js', import.meta.url), 'utf8');
const cookie = response => response.headers.get('set-cookie')?.split(';')[0];
const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)?.[1];

function fixture(t, selection = 'full') {
  const db = openDatabase(':memory:', { modules: resolveModules(selection) });
  t.after(() => db.close());
  seedDemoData(db);
  db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)').run(1, 'design-student', salt, hash);
  return createApp(db, { secret: 'local-test-secret-for-site-design' });
}

function post(app, path, session, form) {
  return app.request(path, {
    method: 'POST',
    headers: { cookie: session },
    body: new URLSearchParams(form),
  });
}

test('оформление выбирается по Save-Data и через защищённую форму с возвратом', async t => {
  const app = fixture(t);
  const automatic = await app.request('/login');
  const content = await automatic.text();
  assert.match(content, /<a class="brand" href="\/login">Личный кабинет<\/a>/);
  assert.match(content, /<title>Вход · Личный кабинет<\/title>/);
  const integrity = 'sha256-' + createHash('sha256').update(source).digest('base64');
  assert.ok(automatic.headers.get('content-security-policy').includes(`script-src '${integrity}'`));
  assert.ok(content.includes(`integrity="${integrity}"`));
  assert.match(content, /\/assets\/design\.js\?v=[a-f0-9]+/);
  assert.doesNotMatch(content, /<link[^>]+href="\/assets\/carbon\.css/);
  const loader = await app.request('/assets/design.js');
  assert.match(loader.headers.get('content-type'), /^text\/javascript/);
  assert.equal(await loader.text(), source);
  const css = await app.request('/assets/carbon.css');
  assert.match(css.headers.get('content-type'), /^text\/css/);
  const stylesheet = await css.text();
  assert.match(stylesheet, /--brand: #0066cc/);
  const version = createHash('sha256').update(stylesheet).digest('hex').slice(0, 12);
  const stylesheetUrl = `/assets/carbon.css?v=${version}`;
  assert.ok(content.includes(`data-stylesheet="${stylesheetUrl}"`));

  const slow = await app.request('/login', { headers: { 'Save-Data': 'on' } });
  assert.match(slow.headers.get('content-security-policy'), /script-src 'none'/);
  assert.doesNotMatch(await slow.text(), /\/assets\/(?:design\.js|carbon\.css)/);
  const session = cookie(automatic);
  const token = csrf(content);
  const change = { mode: 'full', returnTo: '/login?source=check', _csrf: token };
  assert.equal((await post(app, '/settings/design', session, { ...change, _csrf: 'wrong' })).status, 403);
  assert.equal((await post(app, '/settings/design', session, { ...change, mode: 'unknown' })).status, 422);
  const full = await post(app, '/settings/design', session, change);
  assert.equal(full.status, 303);
  assert.equal(full.headers.get('location'), '/login?source=check');
  const fullPage = await app.request('/login', { headers: { cookie: cookie(full), 'Save-Data': 'on' } });
  assert.match(fullPage.headers.get('content-security-policy'), /script-src 'none'/);
  const fullContent = await fullPage.text();
  assert.ok(fullContent.includes(`href="${stylesheetUrl}" media="screen"`));
  assert.doesNotMatch(fullContent, /<script/);
  assert.match(fullContent, /<option value="full" selected>/);
  const lite = await post(app, '/settings/design', session, { ...change, mode: 'lite', returnTo: '//example.test/' });
  assert.equal(lite.headers.get('location'), '/');
  const litePage = await app.request('/login', { headers: { cookie: cookie(lite) } });
  const liteContent = await litePage.text();
  assert.doesNotMatch(liteContent, /\/assets\/(?:design\.js|carbon\.css)/);
  assert.match(liteContent, /<a class="brand" href="\/login">Личный кабинет<\/a>/);
  const reset = await post(app, '/settings/design', session, { ...change, mode: 'auto' });
  assert.match(reset.headers.get('set-cookie'), /Max-Age=0/);
});

test('навигация сохраняет день недели и учитывает включённые модули', async t => {
  for (const modules of ['full', 'full,-schedule', 'full,-calendar']) {
    const app = fixture(t, modules);
    const entry = await app.request('/login');
    const signedIn = await post(app, '/login', cookie(entry), {
      login: 'design-student', password, _csrf: csrf(await entry.text()),
    });
    assert.equal(signedIn.status, 303);
    const designPage = async (path, mode = 'full') => app.request(path, {
      headers: { cookie: `${cookie(signedIn)}; deanery_design=${mode}` },
    });
    const today = await (await designPage('/')).text();
    assert.match(today, /class="design-rail"/);
    assert.match(today, /aria-current="page">Ближайшие занятия/);
    const rail = today.match(/<nav class="design-rail"[^>]*>([\s\S]+?)<\/nav>/)?.[1];
    const groups = Array.from(rail.matchAll(/<details class="design-nav-group"( open="")?><summary>([^<]+)<\/summary>(.*?)<\/details>/g));
    assert.deepEqual(groups.map(([, open, label]) => [label, Boolean(open)]), [
      ['Учебная неделя', true], ['Учёба', false], ['Кабинет', false],
    ]);
    assert.match(groups[0][3], /href="\/" aria-current="page">Ближайшие занятия/);
    assert.match(groups[1][3], /href="\/grades">Ведомость/);
    assert.match(groups[2][3], /href="\/requests">Заявки/);
    for (const [, , label, links] of groups.slice(1)) {
      const destination = links.match(/href="([^"]+)"/)?.[1];
      const result = await designPage(destination);
      assert.equal(result.status, 200);
      assert.ok((await result.text()).includes(`<details class="design-nav-group" open=""><summary>${label}</summary>`));
    }
    const compact = await (await designPage('/', 'lite')).text();
    assert.doesNotMatch(compact, /class="design-rail"|\/assets\/carbon\.css/);
    assert.match(compact, /aria-current="page">Ближайшие занятия/);
    const date = '2026-11-25';
    if (modules !== 'full,-schedule') {
      const schedule = await (await designPage(`/schedule?date=${date}`)).text();
      assert.equal(schedule.includes('class="design-week-tabs"'), modules === 'full');
      if (modules === 'full') assert.match(schedule, new RegExp(`href="/calendar\\?date=${date}">Личный календарь`));
    }
    if (modules !== 'full,-calendar') {
      const calendar = await (await designPage(`/calendar?date=${date}`)).text();
      assert.equal(calendar.includes('class="design-week-tabs"'), modules === 'full');
      assert.match(calendar, new RegExp(`href="#day-${date}"`));
      if (modules === 'full') assert.match(calendar, new RegExp(`href="/schedule\\?date=${date}">Пары группы`));
    }
  }
});

test('новые пользовательские разделы сохраняют общий HTML в full, lite и Save-Data', async t => {
  const app = fixture(t);
  const signIn = await app.request('/login');
  const signedIn = await post(app, '/login', cookie(signIn), {
    login: 'design-student', password, _csrf: csrf(await signIn.text()),
  });
  assert.equal(signedIn.status, 303);
  const paths = [
    ['/search', 'Поиск'],
    [`/disciplines/${encodeURIComponent('Регионоведение')}`, 'Регионоведение'],
    ['/grades/session', 'Сессия'],
    ['/calendar?view=month', 'Личный календарь'],
    ['/deadlines', 'Дедлайны'],
    ['/consultations', 'Консультации'],
    ['/notices?period=week', 'Уведомления'],
    ['/requests/1/print', 'Справка об обучении'],
    ['/assignments', 'Задания'],
    ['/news', 'Новости университета'],
    ['/calendar?view=month&kind=exam', 'Календарь сессии'],
    ['/urgent-appeals', 'Срочное обращение'],
    ['/services/in-development', 'В разработке'],
  ];
  for (const [path, title] of paths) {
    const session = cookie(signedIn);
    const variants = [
      { cookie: `${session}; deanery_design=full` },
      { cookie: `${session}; deanery_design=lite` },
      { cookie: session, 'Save-Data': 'on' },
    ];
    for (const [index, headers] of variants.entries()) {
      const response = await app.request(path, { headers });
      assert.equal(response.status, 200, path);
      const body = await response.text();
      assert.ok(body.includes(`<h1>${title}</h1>`), path);
      assert.equal(body.includes('/assets/carbon.css'), index === 0, path);
      assert.doesNotMatch(body, /<script/, path);
    }
  }
});

function runLoader({ connection, deviceMemory, start = 200 } = {}) {
  let now = start;
  let timer;
  let added;
  const listeners = new Map();
  const link = { remove: () => { added = undefined; } };
  runInNewContext(source, {
    navigator: { connection, deviceMemory },
    performance: { now: () => now, getEntriesByType: () => [{ responseStart: 100 }] },
    document: {
      currentScript: { dataset: { stylesheet: '/assets/carbon.css?v=test-version' } },
      createElement: () => link,
      addEventListener: (event, handler) => listeners.set(event, handler),
      removeEventListener: event => listeners.delete(event),
      head: { append: element => { added = element; } },
    },
    setTimeout: handler => { timer = handler; return 1; },
    clearTimeout: () => { timer = undefined; },
  });
  return {
    stylesheet: () => added,
    load: time => { now = time; link.onload?.(); },
    error: () => link.onerror?.(),
    timeout: () => timer?.(),
    interact: () => listeners.get('keydown')?.(),
  };
}

test('автоматическое оформление сохраняет базовый экран при медленной сети, ошибке и начале работы', () => {
  assert.equal(runLoader({ connection: { effectiveType: '3g' } }).stylesheet(), undefined);
  assert.equal(runLoader({ connection: { saveData: true } }).stylesheet(), undefined);
  assert.equal(runLoader({ deviceMemory: 2 }).stylesheet(), undefined);
  assert.equal(runLoader({ start: 1400 }).stylesheet(), undefined);
  for (const event of ['error', 'timeout', 'interact']) {
    const loader = runLoader();
    assert.equal(loader.stylesheet().media, 'not all');
    loader[event]();
    assert.equal(loader.stylesheet(), undefined);
  }
  const fast = runLoader();
  assert.equal(fast.stylesheet().href, '/assets/carbon.css?v=test-version');
  fast.load(300);
  assert.equal(fast.stylesheet().media, 'screen');
  const late = runLoader();
  late.load(1400);
  assert.equal(late.stylesheet(), undefined);
});
