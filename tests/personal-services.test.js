import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDemoData } from '../demo/seed.js';
import { passwordRecord } from '../src/account/passwords.js';
import { openDatabase } from '../src/db/open.js';
import { resolveModules } from '../src/modules/catalog.js';
import { withSchoolClock } from '../src/modules/clock.js';
import { createApp } from '../src/server.js';

const secret = 'local-test-secret-for-personal-services';
const password = 'personal-test-password';
const { salt, hash } = await passwordRecord(password);
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)[1];

function fixture(t, selection, options) {
  const modules = resolveModules(selection);
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  seedDemoData(db);
  const account = db.prepare('INSERT INTO accounts (student_id, login, salt, password_hash) VALUES (?, ?, ?, ?)');
  account.run(1, 'personal-mira', salt, hash);
  account.run(2, 'personal-mark', salt, hash);
  db.prepare('INSERT INTO students VALUES (?, ?, ?, ?, ?, ?)').run(1040, 'Новый студент', '', '', 1, '');
  account.run(1040, 'personal-new', salt, hash);
  return { db, modules, app: createApp(db, { secret, ...options }) };
}

async function login(app, user) {
  const entry = await app.request('/login');
  const response = await app.request('/login', {
    method: 'POST',
    headers: { cookie: cookie(entry) },
    body: new URLSearchParams({ login: `personal-${user}`, password, _csrf: csrf(await entry.text()) }),
  });
  assert.equal(response.status, 303);
  const headers = { cookie: cookie(response) };
  const get = path => app.request(path, { headers });
  return {
    get,
    async read(path) {
      const response = await get(path);
      assert.equal(response.status, 200, path);
      return response.text();
    },
    post: (path, form) => app.request(path, { method: 'POST', headers, body: new URLSearchParams(form) }),
  };
}

test('билет берёт имя и данные из своего профиля и показывает неполную карточку', async t => {
  const { app, db } = fixture(t, 'core,+student-card');
  assert.equal((await app.request('/student-card')).headers.get('location'), '/login');
  const mira = await login(app, 'mira');
  const mark = await login(app, 'mark');
  const newcomer = await login(app, 'new');
  const card = await mira.read('/student-card?studentId=2');
  assert.match(card, /Демонстрационный билет[\s\S]*Мира Луговая[\s\S]*СБ-000001/);
  assert.match(card, /Регионоведение[\s\S]*Р-21[\s\S]*Международные отношения[\s\S]*<dd>2<\/dd>/);
  assert.doesNotMatch(card, /Марк Ясный|СБ-000002/);
  assert.match(await mark.read('/student-card'), /Марк Ясный[\s\S]*СБ-000002/);
  assert.equal((await mira.get('/student-card/2')).status, 404);
  assert.match(await newcomer.read('/student-card'), /Новый студент[\s\S]*Ещё не присвоен[\s\S]*Не указана/);
  db.prepare('UPDATE students SET full_name = ? WHERE id = ?').run('Мира Луговая-Рощина', 1);
  assert.match(await mira.read('/student-card'), /Мира Луговая-Рощина[\s\S]*СБ-000001/);
});

test('срок оплаты видят только платники, календарь соблюдает границы диапазона', async t => {
  let instant = new Date('2026-11-30T20:59:00Z');
  const { app, db, modules } = fixture(t, 'core,+tuition,+messages', { now: () => instant });
  const paid = db.prepare("SELECT student_id FROM student_tuition WHERE funding = 'paid' ORDER BY student_id")
    .all().map(row => row.student_id);
  assert.deepEqual(paid, [1, 1001, 1003, 1005, 1011]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM student_tuition WHERE funding = 'budget' AND due_date IS NULL").get().count, 10);
  const { calendarEvents } = modules.get('tuition');
  const due = { from: '2026-11-30', to: '2026-11-30' };
  assert.deepEqual(calendarEvents(db, 1, due), [{
    id: 'tuition:1', kind: 'tuition', title: 'Срок оплаты обучения',
    date: '2026-11-30', href: '/tuition',
  }]);
  assert.deepEqual(calendarEvents(db, 1, { from: '2026-11-23', to: '2026-11-29' }), []);
  assert.deepEqual(calendarEvents(db, 2, due), []);
  assert.deepEqual(calendarEvents(db, 1040, due), []);

  const mira = await login(app, 'mira');
  const mark = await login(app, 'mark');
  const newcomer = await login(app, 'new');
  assert.match(await mira.read('/tuition'), /Платное обучение[\s\S]*30 ноября 2026[\s\S]*href="\/messages\/new">Написать в учебный офис/);
  assert.match(await mira.read('/'), /Срок оплаты обучения[\s\S]*30 ноября 2026/);
  assert.doesNotMatch(await mira.read('/'), /Срок оплаты прошёл/);
  assert.match(await mark.read('/tuition?studentId=1'), /Бюджетное обучение/);
  assert.doesNotMatch(await mark.read('/tuition'), /Срок оплаты|30 ноября|messages\/new/);
  assert.doesNotMatch(await mark.read('/'), /Срок оплаты/);
  assert.match(await newcomer.read('/tuition'), /Основание обучения ещё не указано/);
  instant = new Date('2026-11-30T21:00:00Z');
  assert.match(await mira.read('/'), /Срок оплаты прошёл[\s\S]*30 ноября 2026/);
  assert.match(await mira.read('/tuition'), /Срок оплаты прошёл[\s\S]*30 ноября 2026/);
});

test('без сообщений платник видит срок, кабинет не предлагает недоступную форму', async t => {
  const { app } = fixture(t, 'core,+tuition');
  const mira = await login(app, 'mira');
  assert.match(await mira.read('/tuition'), /30 ноября 2026/);
  assert.doesNotMatch(await mira.read('/tuition'), /messages\/new/);
});

test('тема сохраняется за студентом после входа и использует отдельный экранный CSS', async t => {
  const { app, db, modules } = fixture(t, 'core,+theme,+activity');
  const { themeForStudent } = modules.get('theme');
  const css = await app.request('/assets/theme.css');
  assert.match(css.headers.get('content-type'), /^text\/css/);
  assert.match(await css.text(), /@media screen[\s\S]*data-theme="dark"[\s\S]*--focus:/);
  const mira = await login(app, 'mira');
  const mark = await login(app, 'mark');
  const form = await mira.read('/profile');
  assert.match(form, /aria-checked="false"/);
  assert.equal((await mira.post('/settings/theme', { theme: 'dark' })).status, 403);
  assert.equal(themeForStudent(db, 1), 'light');
  const invalid = await mira.post('/settings/theme', { _csrf: csrf(form), theme: 'constructor' });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /Выберите светлую или тёмную тему/);
  assert.equal(themeForStudent(db, 1), 'light');
  const save = await mira.post('/settings/theme', { _csrf: csrf(form), theme: 'dark', student_id: '2' });
  assert.equal(save.status, 303);
  const saved = await mira.read(save.headers.get('location'));
  assert.match(saved, /aria-checked="true"/);
  assert.match(saved, /data-theme="dark"[\s\S]*href="\/assets\/theme.css"/);
  assert.match(await mira.read('/profile'), /data-theme="dark"/);
  assert.equal(themeForStudent(db, 1), 'dark');
  assert.equal(themeForStudent(db, 2), 'light');
  const markTheme = await mark.read('/profile');
  assert.match(markTheme, /aria-checked="false"/);
  assert.doesNotMatch(markTheme, /data-theme="dark"/);
  assert.equal((await mira.read('/activity')).match(/Выбор темы оформления/g)?.length, 1);
  assert.doesNotMatch(await mark.read('/activity'), /Выбор темы оформления/);
  assert.equal((await mira.post('/logout', { _csrf: csrf(form) })).status, 303);
  const again = await login(app, 'mira');
  const restored = await again.read('/profile');
  assert.match(restored, /data-theme="dark"[\s\S]*aria-checked="true"/);
  assert.equal((await again.post('/settings/theme', { _csrf: csrf(restored), theme: 'light' })).status, 303);
  assert.equal(themeForStudent(db, 1), 'light');
  assert.doesNotMatch(await again.read('/profile'), /data-theme="dark"/);
});

test('переключатель в шапке возвращает на текущую страницу и проверяет адрес возврата', async t => {
  const { app, db, modules } = fixture(t, 'core,+theme');
  const mira = await login(app, 'mira');
  const path = '/profile?from=today&tab=study';
  const light = await mira.read(path);
  assert.match(light, /<header class="mast student-mast">[\s\S]*class="theme-switch-form"[^>]*action="\/settings\/theme"/);
  assert.match(light, /role="switch" aria-label="Тёмная тема"\s+aria-checked="false"/);
  assert.match(light, /name="theme" value="dark"/);
  assert.match(light, /name="returnTo" value="\/profile\?from=today&amp;tab=study"/);
  assert.match(light, /href="\/assets\/theme.css"/);

  const form = { _csrf: csrf(light), theme: 'dark', returnTo: path };
  const toggled = await mira.post('/settings/theme', form);
  assert.equal(toggled.status, 303);
  assert.equal(toggled.headers.get('location'), path);
  const dark = await mira.read(path);
  assert.match(dark, /data-theme="dark"/);
  assert.match(dark, /role="switch" aria-label="Тёмная тема"\s+aria-checked="true"/);
  assert.match(dark, /name="theme" value="light"/);

  for (const unsafe of ['https://example.invalid/', '//example.invalid/', '/\\example.invalid/', '/a/..//example.invalid/']) {
    const result = await mira.post('/settings/theme', { ...form, theme: 'light', returnTo: unsafe });
    assert.equal(result.headers.get('location'), '/profile');
  }
  assert.equal(modules.get('theme').themeForStudent(db, 1), 'light');
});

test('история показывает только свои разрешённые категории, ограничивает выборку и сортирует по времени МСК', async t => {
  const { app, db, modules } = fixture(t, 'core,+activity');
  const mira = await login(app, 'mira');
  const mark = await login(app, 'mark');
  db.exec('DELETE FROM student_activity');
  assert.match(await mira.read('/activity'), /В истории пока нет действий/);
  const { recordActivity } = modules.get('activity');
  assert.equal(recordActivity(db, 1, 'private text'), false);
  assert.equal(recordActivity(db, 1, 'deadline', 'private text'), false);
  const beforeMidnight = () => new Date('2026-11-22T20:59:00Z');
  const afterMidnight = () => new Date('2026-11-22T21:01:00Z');
  withSchoolClock(beforeMidnight, () => {
    recordActivity(db, 2, 'message');
    recordActivity(db, 1, 'course');
  });
  withSchoolClock(afterMidnight, () => {
    recordActivity(db, 1, 'event');
    recordActivity(db, 1, 'booking');
    recordActivity(db, 1, 'event', 'cancel');
  });
  const history = await mira.read('/activity?studentId=2');
  assert.match(history, /Отмена записи на мероприятие[\s\S]*Действие с бронированием[\s\S]*23 ноября 2026 · 00:01 МСК[\s\S]*Действие с мероприятием[\s\S]*Выбор курса[\s\S]*22 ноября 2026 · 23:59 МСК/);
  assert.doesNotMatch(history, /Действие с сообщением|private text/);
  assert.match(await mark.read('/activity'), /Действие с сообщением/);
  assert.doesNotMatch(await mark.read('/activity'), /Действие с бронированием/);
  assert.equal((await mira.get('/activity/2')).status, 404);
  withSchoolClock(afterMidnight, () => {
    for (let index = 0; index < 34; index += 1) recordActivity(db, 1, 'theme');
  });
  const latest = await mira.read('/activity');
  assert.equal((latest.match(/Выбор темы оформления/g) ?? []).length, 30);
  assert.doesNotMatch(latest, /Выбор курса|Действие с бронированием/);
});

test('модули блока в чистом ядре отсутствуют вместе с маршрутами и таблицами', async t => {
  const { app, db } = fixture(t, 'core');
  const mira = await login(app, 'mira');
  assert.doesNotMatch(await mira.read('/profile'), /theme-switch|\/assets\/theme.css/);
  for (const path of ['/student-card', '/tuition', '/settings/theme', '/activity', '/assets/theme.css']) {
    assert.equal((await mira.get(path)).status, 404, path);
  }
  const tables = db.prepare(`
    SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name IN ('student_cards', 'student_tuition', 'student_themes', 'student_activity')
  `).all();
  assert.deepEqual(tables, []);
});

test('переключатель темы доступен только в шапке', async t => {
  const { app } = fixture(t, 'core,+theme,+deadlines');
  const mira = await login(app, 'mira');
  for (const path of ['/services', '/profile']) {
    const html = await mira.read(path);
    assert.doesNotMatch(html, /href="\/settings\/theme"|Тема оформления/);
    assert.equal((html.match(/role="switch"/g) ?? []).length, 1);
  }
  assert.equal((await mira.get('/settings/theme')).headers.get('location'), '/profile');
});
