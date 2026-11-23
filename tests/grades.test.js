import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'local-test-secret-for-grades-pages', secure: true };

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
  return cookie(result);
}

test('Мира видит свою ведомость с оценкой, зачётом и предстоящим экзаменом', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const app = createApp(db, options);

  const guest = await app.request('/grades');
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), '/login');

  const session = await login(app, mira);
  const profile = await (await get(app, '/profile', session)).text();
  assert.match(profile, /href="\/grades"/);

  const response = await get(app, '/grades', session);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /Английский язык/);
  assert.match(page, /История региона/);
  assert.match(page, /Регионоведение/);
  assert.match(page, /<strong>5<\/strong>/);
  assert.match(page, /<strong>Зачтено<\/strong>/);
  assert.match(page, /Экзамен/);
  assert.match(page, /Зачёт/);
  assert.match(page, /Ещё не выставлен · 15 декабря 2026/);
  assert.doesNotMatch(page, /Микроэкономика/);
  assert.doesNotMatch(page, /Математика/);
});

test('Марк видит только свои предметы, гость отправляется на вход', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [, mark] = await setupDemo(db);
  const app = createApp(db, options);

  const session = await login(app, mark);
  const response = await get(app, '/grades', session);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /Микроэкономика/);
  assert.match(page, /Математика/);
  assert.match(page, /Экономика/);
  assert.match(page, /<strong>4<\/strong>/);
  assert.match(page, /Ещё не выставлен · 18 декабря 2026/);
  assert.doesNotMatch(page, /Английский язык/);
  assert.doesNotMatch(page, /История региона/);
  assert.doesNotMatch(page, /Регионоведение/);
});

test('сводка и фильтры учитывают только личные оценки, зачёты и результаты в ожидании', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  db.exec(`INSERT INTO grades (student_id, subject, assessment, result) VALUES
    (1, 'Французский язык', 'Экзамен', '2'), (1, 'Практика', 'Зачёт', NULL)`);
  const app = createApp(db, options);
  const miraSession = await login(app, mira);
  const markSession = await login(app, mark);

  const debts = await (await get(app, '/grades?view=debts', miraSession)).text();
  assert.match(debts, /Средний балл<\/dt><dd>3,5<\/dd>/);
  assert.match(debts, /Ждут результата<\/dt><dd>2<\/dd>/);
  assert.match(debts, /view=debts" aria-current="page"/);
  assert.match(debts, /Французский язык/);
  assert.doesNotMatch(debts, /Английский язык|Практика|Экономическая статистика/);

  const pending = await (await get(app, '/grades?view=pending', miraSession)).text();
  assert.match(pending, /Регионоведение[\s\S]*Практика/);
  assert.doesNotMatch(pending, /Французский язык|Английский язык/);

  const markDebts = await (await get(app, '/grades?view=debts', markSession)).text();
  assert.match(markDebts, /Экономическая статистика[\s\S]*Не зачтено/);
  assert.doesNotMatch(markDebts, /Французский язык/);

  const fallback = await (await get(app, '/grades?view=unknown', miraSession)).text();
  assert.match(fallback, /Английский язык[\s\S]*Французский язык/);
});
