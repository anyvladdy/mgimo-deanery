import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'local-test-secret-for-request-scenarios', secure: true };

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

function acceptedCount(db) {
  return db.prepare(
    "SELECT COUNT(*) AS total FROM document_requests WHERE student_id = 1 AND status = 'Принята'"
  ).get().total;
}

test('Мира подаёт заявку, видит её после повторного входа, Марк получает 404 по тому же адресу', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const app = createApp(db, options);

  const miraSession = await login(app, mira);
  const list = await get(app, '/requests', miraSession);
  assert.equal(list.status, 200);
  const listPage = await list.text();
  assert.match(listPage, /Справка об обучении/);
  assert.match(listPage, /Готова/, 'заранее подготовленная заявка показывает статус «Готова»');
  assert.match(listPage, /name="_csrf"/);

  const submitted = await post(app, '/requests', miraSession, { _csrf: token(listPage) });
  assert.equal(submitted.status, 303);
  const location = submitted.headers.get('location');
  assert.match(location, /^\/requests\/\d+$/, 'после подачи открывается личная страница заявки');

  const detail = await get(app, location, miraSession);
  assert.equal(detail.status, 200);
  const detailPage = await detail.text();
  assert.match(detailPage, /Справка об обучении/);
  assert.match(detailPage, /Принята/);

  // Обновление страницы результата не создаёт вторую заявку.
  assert.equal((await get(app, location, miraSession)).status, 200);
  assert.equal(acceptedCount(db), 1);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM document_requests WHERE student_id = 1').get().total,
    2,
    'одна подготовленная заявка и одна новая'
  );

  // Повторный вход в новую сессию: заявка остаётся доступной.
  const logout = await post(app, '/logout', miraSession, { _csrf: token(listPage) });
  assert.equal(logout.status, 303);
  const miraAgain = await login(app, mira);
  const againPage = await (await get(app, '/requests', miraAgain)).text();
  assert.ok(againPage.includes(`href="${location}"`), 'список после повторного входа ведёт на ту же заявку');
  assert.match(againPage, /Принята/);

  // Марк не видит чужую заявку ни по прямому адресу, ни в своём списке.
  const markSession = await login(app, mark);
  const foreign = await get(app, location, markSession);
  assert.equal(foreign.status, 404);
  const foreignPage = await foreign.text();
  assert.match(foreignPage, /Заявка не найдена/);
  assert.doesNotMatch(foreignPage, /Мира Луговая/);
  assert.doesNotMatch(foreignPage, /Справка об обучении/);

  const markList = await (await get(app, '/requests', markSession)).text();
  assert.doesNotMatch(markList, /Справка об обучении/);
  assert.doesNotMatch(markList, /Мира Луговая/);
});

test('заявка сохраняется после перезапуска, повторная подготовка не дублирует данные', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'deanery-requests-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'db.sqlite');
  let db = openDatabase(file);
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  let app = createApp(db, options);

  let session = await login(app, mira);
  const listPage = await (await get(app, '/requests', session)).text();
  const submitted = await post(app, '/requests', session, { _csrf: token(listPage) });
  assert.equal(submitted.status, 303);
  const location = submitted.headers.get('location');
  assert.equal((await get(app, location, session)).status, 200);

  // Обновление результата и перезапуск не добавляют заявок.
  assert.equal((await get(app, location, session)).status, 200);
  db.close();
  db = openDatabase(file);
  app = createApp(db, options);
  assert.match(await (await get(app, location, session)).text(), /Принята/);
  assert.deepEqual(await setupDemo(db), [], 'повторная подготовка сохраняет существующие доступы и данные');
  assert.equal(acceptedCount(db), 1);

  // Новая сессия после перезапуска видит ту же единственную заявку.
  session = await login(app, mira);
  const afterRestart = await (await get(app, '/requests', session)).text();
  assert.ok(afterRestart.includes(`href="${location}"`));
  assert.match(afterRestart, /Принята/);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM document_requests WHERE student_id = 1').get().total,
    2
  );
});
