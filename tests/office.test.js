import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';
import { resetLoginThrottle } from '../src/account/login-throttle.js';

const cookie = response => response.headers.get('set-cookie').split(';')[0];
const token = html => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
const get = (app, path, session) => app.request(path, { headers: { cookie: session } });
const post = (app, path, session, values) => app.request(path, {
  method: 'POST', headers: { cookie: session }, body: new URLSearchParams(values),
});

async function login(app, path, account, target) {
  const form = await app.request(path);
  const guest = cookie(form);
  const response = await post(app, path, guest, { ...account, _csrf: token(await form.text()) });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), target);
  const session = cookie(response);
  assert.notEqual(session, guest);
  return session;
}

test('офис рассматривает перенос и готовит справку. Личная заявка и план отражают решение', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const office = await setupOfficeDemo(db);
  const app = createApp(db, { secret: 'office-test-local-secret-with-32-bytes', secure: true });
  const guest = await app.request('/office/students', { headers: { 'x-role': 'office' } });
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), '/office/login');

  const student = await login(app, '/login', mira, '/');
  const other = await login(app, '/login', mark, '/');
  const staff = await login(app, '/office/login', office, '/office');
  assert.equal((await get(app, '/office/students', student)).status, 403);
  assert.equal((await get(app, '/plan', staff)).headers.get('location'), '/office');
  assert.match(await (await get(app, '/office', staff)).text(), /Рабочий стол[\s\S]*15/);
  const search = await (await get(app, `/office/students?q=${encodeURIComponent('мира')}`, staff)).text();
  assert.match(search, /Мира Луговая/);
  assert.doesNotMatch(search, /Марк Ясный/);

  const csrf = token(await (await get(app, '/requests', student)).text());
  const course = JSON.stringify(['Регионоведение', 'Экзамен']);
  const forbiddenCourse = await post(app, '/requests/postpone', student, { _csrf: csrf, course: JSON.stringify(['Английский язык', 'Экзамен']) });
  assert.equal(forbiddenCourse.status, 422);
  const sent = await post(app, '/requests/postpone', student, { _csrf: csrf, course });
  assert.equal(sent.status, 303);
  const path = sent.headers.get('location');
  const id = path.split('/').at(-1);
  assert.equal((await post(app, '/requests/postpone', student, { _csrf: csrf, course })).headers.get('location'), path);
  assert.equal((await get(app, path, other)).status, 404);
  const review = `/office/requests/${id}/review`;
  assert.equal((await post(app, review, student, { _csrf: csrf, action: 'approve' })).status, 403);
  assert.equal((await post(app, review, staff, { action: 'approve' })).status, 403);
  const officeCsrf = token(await (await get(app, '/office/requests', staff)).text());
  assert.equal((await post(app, review, staff, { _csrf: officeCsrf, action: 'reject' })).status, 422);
  const approved = await post(app, review, staff, { _csrf: officeCsrf, action: 'approve', comment: '<Решение офиса>' });
  assert.equal(approved.status, 303);
  assert.equal((await post(app, review, staff, { _csrf: officeCsrf, action: 'approve' })).status, 303);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM request_reviews WHERE request_id = ?').get(Number(id)).count, 1);
  const detail = await (await get(app, path, student)).text();
  assert.match(detail, /Дисциплина перенесена на следующий учебный год/);
  assert.match(detail, /&lt;Решение офиса&gt;/);
  assert.match(await (await get(app, '/notices', student)).text(), /Решение по заявке[\s\S]*Регионоведение/);
  const plan = await (await get(app, '/plan', student)).text();
  assert.match(plan, /Освоено <strong>9 из 9 з\. е\./);
  assert.match(plan, /На следующий учебный год[\s\S]*Регионоведение/);
  assert.match(await (await get(app, '/office/students/1', staff)).text(), /На следующий учебный год[\s\S]*Регионоведение/);

  const certificate = await post(app, '/requests', student, { _csrf: csrf });
  const certificatePath = certificate.headers.get('location');
  assert.equal((await post(app, `/office${certificatePath}/review`, staff, { _csrf: officeCsrf, action: 'ready' })).status, 303);
  assert.match(await (await get(app, certificatePath, student)).text(), /Справку можно получить в деканате/);
  assert.equal((await post(app, '/office/logout', staff, { _csrf: officeCsrf })).status, 303);
  assert.equal((await get(app, '/office', staff)).headers.get('location'), '/office/login');
});

test('вход сотрудника блокируется после десяти ошибок', async t => {
  resetLoginThrottle();
  t.after(resetLoginThrottle);
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const account = await setupOfficeDemo(db);
  const app = createApp(db, { secret: 'office-lockout-secret-with-32-bytes' });
  const form = await app.request('/office/login');
  const page = await form.text();
  const csrf = token(page);
  const guest = cookie(form);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await post(app, '/office/login', guest, { login: account.login, password: 'неверный', _csrf: csrf });
    assert.equal(response.status, 401);
  }
  const blocked = await post(app, '/office/login', guest, { login: account.login, password: account.password, _csrf: csrf });
  assert.equal(blocked.status, 429);
});
