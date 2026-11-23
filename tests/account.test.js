import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';
import { beginLoginAttempt, resetLoginThrottle } from '../src/account/login-throttle.js';

const options = { secret: 'local-test-secret-for-two-demo-accounts', secure: true };

function cookie(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

function token(page) {
  const match = page.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match, 'форма содержит CSRF-токен');
  return match[1];
}

function post(app, path, jar, fields) {
  return app.request(path, { method: 'POST', headers: { cookie: jar }, body: new URLSearchParams(fields) });
}

async function login(app, account) {
  const form = await app.request('/login');
  assert.match(form.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(form.headers.get('set-cookie'), /Secure/i);
  const oldCookie = cookie(form);
  const result = await post(app, '/login', oldCookie, { ...account, _csrf: token(await form.text()) });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/');
  const signedIn = cookie(result);
  assert.notEqual(signedIn, oldCookie);
  return signedIn;
}

test('два аккаунта, закрытый профиль, срок сессии, ошибка формы и выход', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const app = createApp(db, options);
  const profile = jar => app.request('/profile?studentId=2', { headers: { cookie: jar } });
  const guest = await app.request('/profile');
  assert.equal(guest.headers.get('location'), '/login');
  const form = await app.request('/login');
  const formPage = await form.text();
  assert.doesNotMatch(formPage, /Конкурсный концепт/);
  const guestCookie = cookie(form);
  const csrf = token(formPage);
  assert.equal((await post(app, '/login', guestCookie, mira)).status, 403);
  const wrong = await post(app, '/login', guestCookie, { ...mira, password: 'ошибка', _csrf: csrf });
  assert.equal(wrong.status, 401);
  const wrongPage = await wrong.text();
  assert.match(wrongPage, /Проверьте логин и пароль/);
  assert.match(wrongPage, /aria-invalid="true"/);
  assert.match(wrongPage, /aria-describedby="login-error"/);
  const a = await login(app, mira);
  const b = await login(app, mark);
  const miraPage = await (await profile(a)).text();
  assert.match(miraPage, /Мира Луговая/);
  assert.doesNotMatch(miraPage, /Марк Ясный/);
  const markPage = await (await profile(b)).text();
  assert.match(markPage, /Марк Ясный/);
  assert.doesNotMatch(markPage, /Мира Луговая/);
  assert.equal((await post(app, '/logout', a, { _csrf: token(markPage) })).status, 403);
  assert.equal((await post(app, '/logout', a, { _csrf: token(miraPage) })).status, 303);
  assert.equal((await profile(a)).headers.get('location'), '/login');
  assert.equal((await profile(b)).status, 200);
  db.prepare('UPDATE sessions SET expires_at = 0 WHERE student_id = ?').run(2);
  assert.equal((await profile(b)).headers.get('location'), '/login');
});

test('повторная подготовка и перезапуск сохраняют доступ, явная смена паролей отзывает сессии', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'deanery-account-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'db.sqlite');
  let db = openDatabase(file);
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const session = await login(createApp(db, options), mira);
  db.close();
  db = openDatabase(file);
  assert.deepEqual(await setupDemo(db), []);
  const app = createApp(db, options);
  const getProfile = () => app.request('/profile', { headers: { cookie: session } });
  assert.equal((await getProfile()).status, 200);
  await login(app, mira);
  const [newAccount] = await setupDemo(db, { rotate: true });
  assert.notEqual(newAccount.password, mira.password);
  assert.equal((await getProfile()).status, 303);
  await login(app, newAccount);
});

test('форма входа не раскрывает и не подставляет подготовленные профили', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const app = createApp(db, options);
  for (const url of ['/login', '/login?as=mark', '/login?as=yulia']) {
    const response = await app.request(url);
    assert.equal(response.status, 200, url);
    const page = await response.text();
    assert.doesNotMatch(page, /Мира Луговая|Марк Ясный|Юлия Полевая|подготовленный профиль|Войти как/);
    assert.match(page, /name="login"[^>]*autocomplete="username"[^>]*value=""/);
    assert.match(page, /name="password"[^>]*autocomplete="current-password"/);
  }
});

test('гостю закрыты прямые адреса студента и сотрудников, включая гостевую сессию формы', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const app = createApp(db, options);
  const routes = {
    '/login': [
      '/', '/profile', '/schedule?date=2026-11-23#lesson-101', '/schedule?view=print',
      '/grades', '/grades?view=pending', '/grades?view=debts', '/grades/3/history', '/grades/transcript',
      '/plan', '/syllabuses', '/syllabuses/1', '/requests', '/requests/1', '/notices', '/notices?view=unread',
    ],
    '/office/login': [
      '/office', '/office/requests', '/office/requests?view=waiting', '/office/requests?view=closed',
      '/office/requests/1', '/office/students', '/office/students?q=Мира', '/office/students/1',
      '/office/schedule', '/office/schedule/101', '/office/registry', '/office/registry/enroll',
      '/office/registry/students/1/move', '/office/curriculum', '/office/curriculum/groups/Р-21',
      '/office/curriculum/1', '/office/syllabuses', '/office/syllabuses/1', '/office/syllabuses/new',
      '/office/gradebook', '/office/gradebook/1',
    ],
  };
  const loginForm = await app.request('/login');
  const guest = cookie(loginForm);
  const csrf = token(await loginForm.text());
  for (const [target, urls] of Object.entries(routes)) {
    for (const url of urls) {
      for (const headers of [{}, { cookie: guest }]) {
        for (const method of ['GET', 'HEAD']) {
          const response = await app.request(url, { headers, method });
          assert.equal(response.status, 303, `${method} ${url}`);
          assert.equal(response.headers.get('location'), target, url);
          assert.equal(response.headers.get('cache-control'), 'no-store', url);
          assert.doesNotMatch(await response.text(), /Мира Луговая|Английский язык|История результатов/, url);
        }
      }
    }
  }
  for (const url of ['/requests', '/requests/1/clarifications/1/answer', '/read/1', '/notices/read', '/plan/1/choice']) {
    const response = await post(app, url, guest, { _csrf: csrf });
    assert.equal(response.status, 303, url);
    assert.equal(response.headers.get('location'), '/login', url);
  }
  for (const url of ['/office/requests/1/review', '/office/curriculum/1/publish', '/office/gradebook/1/publish']) {
    const response = await post(app, url, guest, { _csrf: csrf });
    assert.equal(response.status, 303, url);
    assert.equal(response.headers.get('location'), '/office/login', url);
  }
});

test('15 подготовленных аккаунтов входят в свои профили и видят расписание своей группы', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const accounts = await setupDemo(db);
  assert.equal(accounts.length, 15);
  assert.equal(new Set(accounts.map(account => account.password)).size, 15);
  const roster = db.prepare(`
    SELECT a.login, s.full_name, s.group_code FROM accounts a JOIN students s ON s.id = a.student_id
  `).all();
  assert.equal(new Set(roster.map(profile => profile.group_code)).size, 5);

  const app = createApp(db, options);
  for (const account of accounts) {
    const student = roster.find(profile => profile.login === account.login);
    const session = await login(app, account);
    const response = await app.request('/profile', { headers: { cookie: session } });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(`<h1>${student.full_name}</h1>`));
    const schedule = await app.request('/schedule', { headers: { cookie: session } });
    assert.ok((await schedule.text()).includes(`Группа ${student.group_code}`));
  }
  assert.deepEqual(await setupDemo(db), []);
});

test('десять неверных попыток блокируют вход до истечения окна', async t => {
  resetLoginThrottle();
  t.after(resetLoginThrottle);
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const app = createApp(db, options);
  const form = await app.request('/login');
  const page = await form.text();
  const csrf = token(page);
  const guest = cookie(form);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await post(app, '/login', guest, { login: mira.login, password: 'неверный', _csrf: csrf });
    assert.equal(response.status, 401);
  }
  const blocked = await post(app, '/login', guest, { login: mira.login, password: mira.password, _csrf: csrf });
  assert.equal(blocked.status, 429);
  assert.match(await blocked.text(), /Слишком много неверных попыток/);
});

test('вход резервирует место до проверки пароля и разделяет учётные записи офиса и студентов', t => {
  resetLoginThrottle();
  t.after(resetLoginThrottle);
  const reservations = Array.from({ length: 8 }, () => beginLoginAttempt('student', 'mira', 0));
  assert.ok(reservations.every(reservation => typeof reservation === 'function'));
  assert.equal(beginLoginAttempt('office', 'office-user', 0), null);
  for (const finish of reservations) finish(false);
  beginLoginAttempt('student', 'mira', 0)(false);
  const last = beginLoginAttempt('student', 'mira', 0);
  assert.equal(beginLoginAttempt('student', ' MIRA ', 0), null);
  const office = beginLoginAttempt('office', 'mira', 0);
  assert.equal(typeof office, 'function');
  office(true);
  last(false);
  assert.equal(beginLoginAttempt('student', 'mira', 0), null);
  beginLoginAttempt('student', 'mira', 10 * 60 * 1000)(true);
});

test('ограничитель освобождает место после ошибки и успешного входа', t => {
  resetLoginThrottle();
  t.after(resetLoginThrottle);
  const first = beginLoginAttempt('student', '', 0);
  first(false);
  const complete = beginLoginAttempt('student', 'mira', 0);
  const pending = beginLoginAttempt('student', 'mira', 0);
  complete(true);
  for (let attempt = 0; attempt < 9; attempt += 1) beginLoginAttempt('student', 'mira', 0)(false);
  assert.equal(beginLoginAttempt('student', 'mira', 0), null);
  pending(false);
  assert.equal(beginLoginAttempt('student', 'mira', 0), null);
});
