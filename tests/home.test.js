import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'local-test-secret-for-today-pages', secure: true, showProfiles: true };

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

function get(app, path, jar) {
  return app.request(path, { headers: { cookie: jar } });
}

async function login(app, account) {
  const form = await app.request('/login');
  const guestCookie = cookie(form);
  const result = await post(app, '/login', guestCookie, { ...account, _csrf: token(await form.text()) });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/');
  return cookie(result);
}

test('Сегодня показывает ближайшую пару, обе аудитории и навигацию', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const app = createApp(db, options);
  const session = await login(app, mira);

  const response = await get(app, '/', session);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /Сегодня/);
  assert.match(page, /Учебный день/);
  assert.match(page, /Английский язык/);
  assert.match(page, /10:40/);
  assert.match(page, /Аудитория 307/);
  assert.match(page, /Было 214/);
  assert.match(page, /href="\/schedule\?date=2026-11-23#lesson-101"/);
  assert.match(page, /class="nav-link is-active" href="\/" aria-current="page">Сегодня/);
  assert.match(page, /href="\/schedule"/);
  assert.match(page, /href="\/grades"/);
  assert.match(page, /href="\/requests"/);
  assert.match(page, /action="\/read\/1"/);
  assert.doesNotMatch(page, /Конкурсный концепт/);
});

test('Прочитано убирает перенос с главной, но оставляет историю в неделе', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const app = createApp(db, options);
  const session = await login(app, mira);

  const page = await (await get(app, '/', session)).text();
  const read = await post(app, '/read/1', session, { _csrf: token(page) });
  assert.equal(read.status, 303);
  assert.equal(read.headers.get('location'), '/');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM change_reads WHERE student_id = 1 AND change_id = 1').get().n, 1);

  const after = await (await get(app, '/', session)).text();
  assert.match(after, /Аудитория 307/);
  assert.doesNotMatch(after, /Было 214/);
  assert.doesNotMatch(after, /action="\/read\/1"/);
  assert.match(after, /Перенос отмечен прочитанным/);

  const week = await (await get(app, '/schedule', session)).text();
  assert.match(week, /Было 214/);
});

test('Сегодня Марка показывает его пару и не открывает чужие данные', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [, mark] = await setupDemo(db);
  const app = createApp(db, options);

  const guest = await app.request('/');
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), '/login');

  const session = await login(app, mark);
  const page = await (await get(app, '/', session)).text();
  assert.match(page, /Микроэкономика/);
  assert.match(page, /Аудитория 215/);
  assert.doesNotMatch(page, /Английский язык/);
  assert.doesNotMatch(page, /307/);
  assert.doesNotMatch(page, /action="\/read\/1"/);
});
