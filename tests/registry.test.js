import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

test('офис зачисляет студента и переводит с сохранением истории и полученных результатов', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const operator = await setupOfficeDemo(db);
  const app = createApp(db, { secret: 'registry-test-secret-for-demo-only' });
  const cookie = response => response.headers.get('set-cookie').split(';')[0];
  const csrf = html => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const get = (path, session) => app.request(path, { headers: { cookie: session } });
  const post = (path, session, fields) => app.request(path, {
    method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields),
  });
  async function login(path, account) {
    const entry = await app.request(path);
    const signed = await post(path, cookie(entry), { ...account, _csrf: csrf(await entry.text()) });
    assert.equal(signed.status, 303);
    return cookie(signed);
  }
  const office = await login('/office/login', operator);
  const student = await login('/login', mira);
  const token = csrf(await (await get('/office/registry', office)).text());
  const command = (path, fields) => post(`/office/registry${path}`, office, { ...fields, _csrf: token });
  assert.equal((await get('/office/registry/enroll', student)).status, 403);
  assert.equal((await command('/programs', { name: 'Международная аналитика', faculty: 'Аналитика' })).status, 303);
  const group = { code: 'МА-11', program: 'Международная аналитика', year: '1' };
  assert.equal((await command('/groups', group)).status, 303);
  assert.equal((await command('/groups', group)).status, 409);
  const enrollment = () => command('/enroll', { name: 'Кира Полозова', login: 'kira-local', group: group.code });
  const responses = await Promise.all([enrollment(), enrollment()]);
  assert.deepEqual(responses.map(reply => reply.status).sort(), [201, 409]);
  const receipt = await responses.find(reply => reply.status === 201).text();
  const password = receipt.match(/Пароль для входа<\/dt><dd><code>([^<]+)<\/code>/)?.[1];
  assert.ok(password);
  const newcomer = await login('/login', { login: 'kira-local', password });
  const profile = await (await get('/profile', newcomer)).text();
  assert.match(profile, /Кира Полозова[\s\S]*Зачисление в МА-11/);
  assert.doesNotMatch(profile, new RegExp(password));

  const postpone = await post('/requests/postpone', student, {
    _csrf: csrf(await (await get('/requests', student)).text()),
    course: JSON.stringify(['Регионоведение', 'Экзамен']),
  });
  assert.equal(postpone.status, 303);
  const reviewed = await post(`/office${postpone.headers.get('location')}/review`, office, { _csrf: token, action: 'approve' });
  assert.equal(reviewed.status, 303);

  const movePath = '/office/registry/students/1/move';
  const report = await (await get(`${movePath}?group=${encodeURIComponent('Э-11')}`, office)).text();
  assert.match(report, /После перевода[\s\S]*Э-11[\s\S]*Английский язык · 5 з\. е\./);
  assert.equal(db.prepare('SELECT group_code FROM students WHERE id = 1').get().group_code, 'Р-21');
  const form = { expected: 'Р-21', group: 'Э-11', _csrf: token };
  assert.equal((await post(movePath, office, form)).status, 303);
  assert.equal((await post(movePath, office, form)).status, 303);
  assert.equal((await post(movePath, office, { ...form, group: 'Ю-12' })).status, 409);
  const moved = await (await get('/profile', student)).text();
  assert.match(moved, /Экономика[\s\S]*Перевод из Р-21 в Э-11/);
  assert.doesNotMatch(moved, /Анна Борисова/);
  const plan = await (await get('/plan', student)).text();
  assert.match(plan, /Английский язык[\s\S]*Из прежнего плана[\s\S]*5 з\. е\./);
  assert.match(plan, /Микроэкономика/);
  assert.match(plan, /На следующий учебный год[\s\S]*Регионоведение/);
  assert.doesNotMatch(plan.split('<section id="postponed"')[0], /Регионоведение/);
  assert.doesNotMatch(await (await get('/grades?view=pending', student)).text(), /\/history">Регионоведение/);
  assert.match(await (await get('/schedule', student)).text(), /Микроэкономика/);
  assert.match(await (await get('/requests/1', student)).text(), /Справку можно получить/);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM student_movements WHERE student_id = 1').get().total, 1);
});
