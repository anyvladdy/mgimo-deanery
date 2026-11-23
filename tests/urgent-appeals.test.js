import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './support/app-fixture.js';

const office = '/office/urgent-appeals';
const student = '/urgent-appeals';
const routing = `${office}/routing`;

test('срочное обращение связано со своей заявкой и переходит только назначенным руководителям', async t => {
  const staffAccounts = [
    [3, 'program-lead', 'Руководитель программы', 'leadership'],
    [4, 'dean-lead', 'Декан', 'leadership'],
    [5, 'rector-lead', 'Ректор', 'leadership'],
    [6, 'router', 'Администратор', 'admin'],
    [7, 'other-program', 'Другой руководитель', 'leadership'],
  ];
  const { db, login } = fixture(t, { staffAccounts });
  const [mira, mark, ordinary, teacher, head, dean, rector, admin] = await Promise.all(
    ['mira', 'mark', 'office', 'teacher', 'program-lead', 'dean-lead', 'rector-lead', 'router'].map(login),
  );
  const other = await login('other-program');
  const assign = (level, scope, staffId) => ({ destination: JSON.stringify([level, scope]), recipient: String(staffId) });
  assert.match(await mira.page(student), /пока нет доступных получателей/);
  assert.equal((await head.get('/office')).headers.get('location'), office);
  assert.equal((await head.get('/office/students')).status, 403);
  assert.equal((await head.get('/office/gradebook')).status, 403);
  assert.equal((await head.get('/office/news')).status, 403);
  assert.equal((await teacher.get(office)).status, 403);
  assert.equal((await ordinary.post(routing, assign('program', 'Регионоведение', 3))).status, 403);
  assert.equal((await admin.post(routing, { ...assign('program', 'Регионоведение', 3), _csrf: 'wrong' })).status, 403);
  assert.equal((await admin.post(routing, assign('program', 'Регионоведение', 2))).status, 422);
  for (const selection of [assign('program', 'Регионоведение', 3), assign('dean', 'Международные отношения', 4),
    assign('rector', '', 5), assign('program', 'Экономика', 7)]) {
    assert.equal((await admin.post(routing, selection)).status, 303);
  }
  const requests = await mira.page('/requests/1');
  assert.match(requests, /href="\/urgent-appeals\?request=1">Срочное обращение/);
  assert.equal((await mark.get(student + '?request=1')).status, 404);
  const form = await mira.page(student + '?request=1');
  const fields = { level: 'program', subject: 'Рассмотрение заявки', body: 'Нужна помощь <сегодня>.', request: '1',
    key: form.match(/name="key" value="([^"]+)"/)[1] };
  assert.equal((await mark.post(student, fields)).status, 404);
  assert.equal((await mira.post(student, { ...fields, _csrf: 'wrong' })).status, 403);
  const created = await mira.post(student, fields);
  assert.equal(created.status, 303);
  assert.equal((await mira.post(student, fields)).headers.get('location'), created.headers.get('location'));
  const own = created.headers.get('location');
  const path = `/office${own}`;
  assert.equal((await mark.get(own)).status, 404);
  assert.doesNotMatch(await other.page(office), /Рассмотрение заявки/);
  for (const actor of [ordinary, dean, rector, admin, other]) assert.equal((await actor.get(path)).status, 404);
  assert.match(await head.page(path), /Нужна помощь &lt;сегодня&gt;/);
  assert.equal((await dean.post(path + '/handle', { action: 'forward', version: '1' })).status, 404);
  assert.equal((await head.post(path + '/handle', { action: 'forward', version: '1' })).status, 303);
  assert.equal((await head.get(path)).status, 404);
  assert.match(await mira.page(own), /Передано · Декан факультета/);
  assert.equal((await dean.post(path + '/handle', { action: 'forward', version: '1' })).status, 409);
  assert.equal((await dean.post(path + '/handle', { action: 'forward', version: '2' })).status, 303);
  assert.equal((await rector.post(path + '/handle', { action: 'resolve', version: '3', response: 'Проверили обращение.' })).status, 303);
  assert.match(await mira.page(own), /Есть ответ[\s\S]*Проверили обращение\.[\s\S]*Передано · Ректор/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM urgent_appeals').get().count, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
