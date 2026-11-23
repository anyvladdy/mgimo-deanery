import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Hono } from 'hono';
import { fileURLToPath } from 'node:url';
import { seedDemoData } from '../demo/seed.js';
import { passwordRecord } from '../src/account/passwords.js';
import { openDatabase } from '../src/db/open.js';
import { bindModules } from '../src/modules/config.js';
import { resolveModules } from '../src/modules/catalog.js';
import { createApp } from '../src/server.js';

const appOptions = { secret: 'local-test-secret-for-deanery-harness' };
const password = 'fixture-password';
const { salt, hash } = await passwordRecord(password);
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)?.[1];
const tableNames = db => db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all()
  .map(row => row.name);

function fixture(db, modules) {
  seedDemoData(db);
  const student = db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)');
  student.run(1, 'harness-mira', salt, hash);
  student.run(2, 'harness-mark', salt, hash);
  if (modules.has('office')) {
    const staff = db.prepare('INSERT INTO staff_accounts (login, full_name, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)');
    staff.run('harness-office', 'Демо · Офис', 'office', salt, hash);
    staff.run('harness-teacher', 'Демо · Преподаватель', 'teacher', salt, hash);
  }
}

function request(app, path, session, form) {
  return app.request(path, {
    headers: { cookie: session },
    ...(form ? { method: 'POST', body: new URLSearchParams(form) } : {}),
  });
}

async function login(app, user, path = '/login') {
  const entry = await app.request(path);
  assert.equal(entry.status, 200, path);
  const response = await request(app, path, cookie(entry), {
    login: `harness-${user}`, password, _csrf: csrf(await entry.text()),
  });
  assert.equal(response.status, 303, path);
  return cookie(response);
}

test('чистое ядро по брифу: пять разделов, личные статусы, расписание и напоминания', async t => {
  const modules = resolveModules('core');
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  fixture(db, modules);
  assert.deepEqual(modules.ids, ['grades', 'notices', 'requests', 'schedule']);
  assert.deepEqual(tableNames(db), [
    'accounts', 'assessment_reminder_reads', 'change_reads', 'document_requests', 'grades', 'lessons',
    'notice_requirements', 'notices', 'notification_reads', 'room_changes', 'schema_migrations', 'sessions', 'students',
  ]);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const app = createApp(db, appOptions);
  assert.doesNotMatch(await (await app.request('/login')).text(), /href="\/(office\/login|recover)"/);
  const [mira, mark] = await Promise.all([login(app, 'mira'), login(app, 'mark')]);
  const page = async (path, session = mira) => {
    const response = await request(app, path, session);
    assert.equal(response.status, 200, path);
    return response.text();
  };
  const profile = await page('/profile');
  assert.match(profile, /Мира Луговая[\s\S]*Р-21/);
  assert.match(profile, /class="section-menu"[\s\S]*?href="\/profile" aria-current="page">Профиль<\/a>/);
  assert.match(await page('/schedule'), /Английский язык[\s\S]*307/);
  assert.doesNotMatch(await page('/schedule'), /view=print|\/messages/);
  assert.doesNotMatch(await page('/schedule', mark), /Английский язык|307/);
  assert.match(await page('/grades'), /Регионоведение/);
  assert.doesNotMatch(await page('/grades'), /\/grades\/transcript/);
  assert.match(await page('/notices'), /Напоминание о сессии/);
  assert.match(await page('/notices'), /два первичных источника/);
  const requests = await page('/requests');
  assert.match(requests, /Готова/);
  assert.doesNotMatch(requests, /requests\/postpone/);
  const unauthorised = await request(app, '/requests', mira, {});
  assert.equal(unauthorised.status, 403);
  const created = await request(app, '/requests', mira, { _csrf: csrf(requests) });
  assert.equal(created.status, 303);
  const path = created.headers.get('location');
  assert.match(await page(path), /Принята/);
  assert.equal((await request(app, path, mark)).status, 404);
});

const studentRoutes = new Map([
  ['schedule', '/schedule'], ['grades', '/grades'], ['requests', '/requests'],
  ['notices', '/notices'], ['plan', '/plan'], ['syllabus', '/syllabuses/1'],
  ['messages', '/messages'], ['transcript', '/grades/transcript'],
  ['disciplines', `/disciplines/${encodeURIComponent('Регионоведение')}`],
  ['search', '/search'], ['consultations', '/consultations'], ['calendar', '/calendar?view=month'],
  ['assignments', '/assignments'], ['university-news', '/news'], ['urgent-appeals', '/urgent-appeals'],
  ['in-development', '/services/in-development'], ['electives', '/electives'],
]);
const officeRoutes = new Map([
  ['request-review', '/office/requests'], ['room-publication', '/office/schedule'], ['exams', '/office/exams'],
  ['curriculum', '/office/curriculum'], ['registry', '/office/registry'],
  ['syllabus', '/office/syllabuses'], ['gradebook', '/office/gradebook'],
  ['messages', '/office/messages'], ['recovery', '/office/recovery'], ['consultations', '/office/consultations'],
  ['assignments', '/office/assignments'], ['university-news', '/office/news'], ['urgent-appeals', '/office/urgent-appeals'],
]);

const ownedTables = new Map([
  ['assignments', ['assignments', 'assignment_submissions']],
  ['consultations', ['consultation_slots', 'consultation_bookings']],
  ['syllabus', ['syllabus_formulas']],
  ['university-news', ['university_news']],
  ['urgent-appeals', ['urgent_recipients', 'urgent_appeals', 'urgent_appeal_events']],
]);

test('после одиночного отключения каждого модуля остальные разделы и ссылки продолжают работать', async () => {
  for (const disabled of resolveModules().ids) {
    const modules = resolveModules(`full,-${disabled}`);
    assert.equal(modules.has(disabled), false, disabled);
    const db = openDatabase(':memory:', { modules });
    try {
      fixture(db, modules);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], disabled);
      const tables = new Set(tableNames(db));
      for (const [id, own] of ownedTables) {
        for (const table of own) assert.equal(tables.has(table), modules.has(id), `-${disabled} ${table}`);
      }
      const app = createApp(db, appOptions);
      const student = await login(app, 'mira');
      const home = await request(app, '/', student);
      assert.equal(home.status, 200, disabled);
      const body = await home.text();
      for (const [id, path] of studentRoutes) {
        const response = await request(app, path, student);
        assert.equal(response.status, modules.has(id) ? 200 : 404, `-${disabled} ${path}`);
        if (!modules.has(id)) {
          assert.ok(!body.includes(`href="${path}"`), `-${disabled} ссылка ${path}`);
        }
      }
      const recovery = await request(app, '/recover', student);
      assert.equal(recovery.status, modules.has('recovery') ? 303 : 404, disabled);
      if (disabled === 'schedule') {
        assert.match(body, /Расписание сейчас недоступно/);
        assert.match(body, /Доступные разделы/);
        assert.match(body, /Ближайшие экзамены и зачёты/);
        assert.doesNotMatch(body, /href="\/schedule\b/);
        const notices = await (await request(app, '/notices', student)).text();
        assert.doesNotMatch(notices, /Перенос аудитории|href="\/schedule\b/);
        const stale = await request(app, '/notices/read', student, { _csrf: csrf(notices), kind: 'room', event: 1 });
        assert.equal(stale.status, 404);
      }
      if (!modules.has('office')) continue;
      const employee = await login(app, 'office', '/office/login');
      assert.equal((await request(app, '/office/students/1', employee)).status, 200, disabled);
      const dashboard = await request(app, '/office', employee);
      assert.equal(dashboard.status, 200, disabled);
      const dashboardBody = await dashboard.text();
      if (disabled === 'schedule') {
        const staleOfficeLink = await request(app, '/office/schedule', employee);
        assert.equal(staleOfficeLink.status, 404);
        const staleOfficePage = await staleOfficeLink.text();
        assert.match(staleOfficePage, /Раздел может быть отключён/);
        assert.match(staleOfficePage, /href="\/office">К рабочему столу<\/a>/);
      }
      for (const [id, path] of officeRoutes) {
        const response = await request(app, path, employee);
        assert.equal(response.status, modules.has(id) ? 200 : 404, `-${disabled} ${path}`);
        if (!modules.has(id)) {
          assert.ok(!dashboardBody.includes(`href="${path}"`), `-${disabled} ссылка ${path}`);
        }
      }
    } finally {
      db.close();
    }
  }
});

test('состав меняется на прежнем файле SQLite, записанные данные возвращаются с модулем', async t => {
  const root = mkdtempSync(join(tmpdir(), 'mgimo-harness-db-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const filename = join(root, 'deanery.sqlite');
  const full = resolveModules();
  let db = openDatabase(filename, { modules: full });
  fixture(db, full);
  db.prepare('UPDATE lessons SET teacher = ? WHERE id = 101').run('Преподаватель · проверка сохранения');
  const news = db.prepare(`
    INSERT INTO university_news (title, body, published_at)
    VALUES ('Сохранённая публикация', 'Текст новости', '2026-11-22 08:00:00') RETURNING id
  `).get().id;
  db.exec(`
    INSERT INTO assignments (id, group_code, subject, assessment, title, description, due_date, created_by, published_at, request_key)
    SELECT 15, 'Р-21', 'Регионоведение', 'Экзамен', 'Сохранённое задание', 'Описание',
      '2026-11-27', id, '2026-11-22 08:00:00', 'fixture-task' FROM staff_accounts WHERE login = 'harness-teacher';
    INSERT INTO assignment_submissions (assignment_id, student_id, text, link, submitted_at, status)
    VALUES (15, 1, 'Готовая работа', '', '2026-11-23 05:00:00', 'submitted');
    INSERT INTO urgent_appeals (id, student_id, program, faculty, level, subject, body, created_at, request_key)
    VALUES (5, 1, 'Регионоведение', 'Международные отношения', 'program', 'Сохранённое обращение', 'Описание',
      '2026-11-23 06:00:00', 'fixture-appeal');
  `);
  db.close();

  const withoutExtras = resolveModules('core,-schedule');
  db = openDatabase(filename, { modules: withoutExtras });
  let app = createApp(db, appOptions);
  const student = await login(app, 'mira');
  const mark = await login(app, 'mark');
  for (const path of ['/schedule', `/news/${news}`, '/assignments/15', '/urgent-appeals/5']) {
    assert.equal((await request(app, path, student)).status, 404, path);
  }
  for (const [table, id] of [['university_news', 'university-news'], ['assignment_submissions', 'assignments'], ['urgent_appeals', 'urgent-appeals']]) {
    assert.ok(tableNames(db).includes(table), id);
  }
  const markNotices = await (await request(app, '/notices', mark)).text();
  assert.doesNotMatch(markNotices, /Аналитика и данные/);
  assert.ok(tableNames(db).includes('lessons'), 'история модуля остаётся в рабочем файле');
  db.close();

  db = openDatabase(filename, { modules: full });
  t.after(() => db.close());
  app = createApp(db, appOptions);
  assert.match(await (await request(app, '/schedule', student)).text(), /проверка сохранения/);
  assert.match(await (await request(app, '/notices', mark)).text(), /Аналитика и данные/);
  assert.match(await (await request(app, `/news/${news}`, student)).text(), /Сохранённая публикация/);
  assert.match(await (await request(app, '/assignments/15', student)).text(), /Сдано[\s\S]*Готовая работа/);
  assert.match(await (await request(app, '/urgent-appeals/5', student)).text(), /Сохранённое обращение/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('физическое удаление папок и установка нового модуля без правок ядра', t => {
  const root = mkdtempSync(join(tmpdir(), 'mgimo-harness-plugin-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = fileURLToPath(new URL('../src', import.meta.url));
  const disabled = [
    'schedule', 'office', 'plan', 'assignments', 'university-news', 'urgent-appeals',
    'in-development', 'consultations', 'disciplines', 'search',
  ];
  const removed = new Set(disabled.map(dir => join(source, dir)));
  cpSync(source, join(root, 'src'), { recursive: true, filter: path => !removed.has(path) });
  cpSync(new URL('../package.json', import.meta.url), join(root, 'package.json'));
  symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
  const addon = join(root, 'src', 'check-in');
  mkdirSync(addon);
  writeFileSync(join(addon, 'schema.sql'), 'CREATE TABLE IF NOT EXISTS check_ins (student_id INTEGER PRIMARY KEY REFERENCES students(id));');
  writeFileSync(join(addon, 'module.js'), `
    import { Hono } from 'hono';
    import { html } from 'hono/html';
    export default {
      id: 'check-in',
      studentMount() {
        const routes = new Hono();
        routes.get('/', c => c.text('Самостоятельный модуль: ' + c.get('studentId')));
        return ['/check-in', routes];
      },
      navigation: group => group === 'studentTools' ? [[99, '/check-in', 'Отметка', 'check-in', 'study']] : [],
      todayPanel: () => html\`<section class="today-panel"><h2>Карточка нового модуля</h2></section>\`,
    };
  `);
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createApp } from './src/server.js';
    import { openDatabase } from './src/db/open.js';
    import { resolveModules } from './src/modules/catalog.js';
    import { passwordRecord } from './src/account/passwords.js';

    const modules = resolveModules('full,+schedule');
    for (const id of [...${JSON.stringify(disabled)}, 'schedule-print', 'room-publication', 'messages', 'gradebook']) {
      assert.equal(modules.has(id), false, id);
    }
    assert.equal(modules.has('check-in'), true);
    const db = openDatabase(':memory:', { modules });
    try {
      assert.ok(db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'check_ins'").get());
      assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'lessons'").get(), undefined);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      db.prepare("INSERT INTO students VALUES (1, 'Мира', 'Факультет', 'Программа', 1, 'А')").run();
      const { salt, hash } = await passwordRecord('fixture-password');
      db.prepare("INSERT INTO accounts VALUES (1, 'mira', ?, ?)").run(salt, hash);
      const app = createApp(db, { secret: 'local-test-secret-for-extra-module' });
      assert.equal((await app.request('/check-in')).headers.get('location'), '/login');
      const entry = await app.request('/login');
      const grant = await app.request('/login', {
        method: 'POST',
        headers: { cookie: entry.headers.get('set-cookie').split(';')[0] },
        body: new URLSearchParams({
          login: 'mira', password: 'fixture-password',
          _csrf: (await entry.text()).match(/name="_csrf" value="([^"]+)"/)[1],
        }),
      });
      assert.equal(grant.status, 303);
      const headers = { cookie: grant.headers.get('set-cookie').split(';')[0] };
      assert.match(await (await app.request('/check-in', { headers })).text(), /Самостоятельный модуль: 1/);
      const home = await (await app.request('/', { headers: { cookie: headers.cookie + '; deanery_design=full' } })).text();
      const study = home.match(/<summary>Учёба<\\/summary>([\\s\\S]*?)<\\/details>/)?.[1];
      assert.match(study ?? '', /href="\\/check-in"/);
      for (const path of ['/assignments', '/news', '/urgent-appeals', '/services/in-development', '/search', '/consultations']) {
        assert.equal((await app.request(path, { headers })).status, 404, path);
        assert.ok(!home.includes('href="' + path + '"'), path);
      }
      assert.match(home, /href="\\/check-in"/);
      assert.match(home, /Карточка нового модуля/);
      assert.match(home, /Расписание сейчас недоступно/);
    } finally {
      db.close();
    }
  `], { cwd: root, stdio: 'pipe' });
});

test('шлюз сам проверяет роли у независимых офисных модулей', async t => {
  const modules = resolveModules('core,+office');
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  fixture(db, modules);
  const staff = db.prepare('INSERT INTO staff_accounts (login, full_name, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)');
  staff.run('harness-leader', 'Демо Руководитель', 'leadership', salt, hash);
  staff.run('harness-admin', 'Демо Администратор', 'admin', salt, hash);

  const mount = (id, flags) => ({
    id,
    staffMount() {
      const routes = new Hono();
      routes.get('/', c => c.text(id));
      return { path: `/${id}`, routes, ...flags };
    },
  });
  const addons = [
    mount('leader-addon', { leadership: true }),
    mount('teacher-addon', { teachers: true }),
    mount('shared-addon', { teachers: true, leadership: true }),
    mount('office-addon', {}),
  ];
  bindModules(db, { ...modules, entries: function* () { yield* modules.entries(); yield* addons; } });
  const app = createApp(db, appOptions);
  const [student, teacher, leader, office, admin] = await Promise.all([
    login(app, 'mira'),
    ...['teacher', 'leader', 'office', 'admin'].map(user => login(app, user, '/office/login')),
  ]);
  const access = [
    ['leader-addon', [403, 403, 200, 200, 200]],
    ['teacher-addon', [403, 200, 403, 200, 200]],
    ['shared-addon', [403, 200, 200, 200, 200]],
    ['office-addon', [403, 403, 403, 200, 200]],
  ];
  for (const [id, statuses] of access) {
    assert.equal((await app.request(`/office/${id}`)).status, 303);
    for (const [index, session] of [student, teacher, leader, office, admin].entries()) {
      assert.equal((await request(app, `/office/${id}`, session)).status, statuses[index], `${id} role ${index}`);
    }
  }
});

test('каждый реальный офисный раздел закрыт шлюзом по своим флагам', async t => {
  const modules = resolveModules();
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  fixture(db, modules);
  const staff = db.prepare('INSERT INTO staff_accounts (login, full_name, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)');
  staff.run('harness-leader', 'Демо Руководитель', 'leadership', salt, hash);
  staff.run('harness-admin', 'Демо Администратор', 'admin', salt, hash);

  const context = { db, currentSchoolDay: () => ({ date: '2026-11-23', time: '08:00:00' }) };
  const mounts = [...modules.entries()]
    .filter(module => module.staffMount)
    .map(module => ({ id: module.id, ...module.staffMount(context) }));
  assert.equal(mounts.length, 13, 'все офисные подключения должны быть в проверке');

  const app = createApp(db, appOptions);
  const [student, teacher, leader, office, admin] = await Promise.all([
    login(app, 'mira'),
    ...['teacher', 'leader', 'office', 'admin'].map(user => login(app, user, '/office/login')),
  ]);
  for (const mount of mounts) {
    const expected = [403, mount.teachers ? 200 : 403, mount.leadership ? 200 : 403, 200, 200];
    for (const [index, session] of [student, teacher, leader, office, admin].entries()) {
      assert.equal((await request(app, `/office${mount.path}`, session)).status, expected[index],
        `${mount.id} · роль ${index}`);
    }
  }
});
