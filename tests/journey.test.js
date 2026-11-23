import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'local-test-secret-for-end-to-end-journey', secure: true };

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

test('сквозной путь: вход, расписание, ведомость, справка и второй аккаунт', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const app = createApp(db, options);

  const health = await app.request('/health');
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');
  assert.equal((await app.request('/profile')).headers.get('location'), '/login');

  const miraSession = await login(app, mira);
  const today = await (await get(app, '/', miraSession)).text();
  assert.match(today, /<h1>Ближайшие занятия<\/h1>/);
  assert.match(today, /Английский язык/);
  assert.match(today, /Аудитория 307/);
  assert.match(today, /Было 214/);

  const profile = await (await get(app, '/profile', miraSession)).text();
  assert.match(profile, /href="\/schedule"/);
  assert.match(profile, /href="\/grades"/);
  assert.match(profile, /href="\/requests"/);

  const schedule = await (await get(app, '/schedule', miraSession)).text();
  assert.match(schedule, /Английский язык/);
  assert.match(schedule, /ауд\. 307/);
  assert.match(schedule, /Было 214/);
  assert.match(schedule, /id="lesson-101"/);

  const grades = await (await get(app, '/grades', miraSession)).text();
  assert.match(grades, /<strong>5<\/strong>/);
  assert.match(grades, /<strong>Зачтено<\/strong>/);
  assert.match(grades, /Ещё не выставлен · 15 декабря 2026/);
  assert.doesNotMatch(grades, /Микроэкономика/);

  const requests = await (await get(app, '/requests', miraSession)).text();
  assert.match(requests, /Готова/);
  const submitted = await post(app, '/requests', miraSession, { _csrf: token(requests) });
  assert.equal(submitted.status, 303);
  const location = submitted.headers.get('location');
  assert.match(location, /^\/requests\/\d+$/);
  const detailResponse = await get(app, location, miraSession);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.text();
  assert.match(detail, /Принята/);
  assert.equal((await get(app, location, miraSession)).status, 200);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS total FROM document_requests WHERE student_id = 1 AND status = 'Принята'").get().total,
    1,
    'обновление страницы результата не дублирует заявку'
  );

  assert.equal((await post(app, '/logout', miraSession, { _csrf: token(requests) })).status, 303);
  const miraAgain = await login(app, mira);
  const again = await (await get(app, '/requests', miraAgain)).text();
  assert.ok(again.includes(`href="${location}"`));

  const markSession = await login(app, mark);
  const markToday = await (await get(app, '/', markSession)).text();
  assert.match(markToday, /Микроэкономика/);
  assert.match(markToday, /Аудитория 215/);
  assert.doesNotMatch(markToday, /Было 214/);
  const markSchedule = await (await get(app, '/schedule', markSession)).text();
  assert.match(markSchedule, /Микроэкономика/);
  assert.match(markSchedule, /ауд\. 215/);
  assert.doesNotMatch(markSchedule, /307/);
  const markGrades = await (await get(app, '/grades', markSession)).text();
  assert.match(markGrades, /<strong>4<\/strong>/);
  assert.doesNotMatch(markGrades, /Английский язык/);
  const markRequests = await (await get(app, '/requests', markSession)).text();
  assert.doesNotMatch(markRequests, /Справка об обучении/);
  assert.equal((await get(app, location, markSession)).status, 404);
});
