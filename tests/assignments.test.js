import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './support/app-fixture.js';

const staff = '/office/assignments';
const course = JSON.stringify(['Р-21', 'Регионоведение', 'Экзамен']);
const formKey = page => page.match(/name="key" value="([^"]+)"/)[1];

test('студент сдаёт работу, назначенный преподаватель проверяет и возвращает текущую версию', async t => {
  let now = new Date('2026-11-23T05:00:00Z');
  const { db, login } = fixture(t, { now: () => now, staffAccounts: [[3, 'other-teacher', 'Другой преподаватель', 'teacher']] });
  const [mira, mark, peer, teacher, other] = await Promise.all(['mira', 'mark', 'peer', 'teacher', 'other-teacher'].map(login));
  const draft = {
    course, title: 'Анализ источников', description: 'Сопоставьте два свидетельства.', date: '24.11.2026',
    key: formKey(await teacher.page(staff)),
  };
  assert.equal((await teacher.post(staff, { ...draft, _csrf: 'wrong' })).status, 403);
  assert.equal((await other.post(staff, draft)).status, 422);
  const created = await teacher.post(staff, draft);
  assert.equal(created.status, 303);
  assert.equal((await teacher.post(staff, draft)).headers.get('location'), created.headers.get('location'));
  const id = db.prepare('SELECT id FROM assignments').get().id;
  const studentPath = `/assignments/${id}`;
  const officePath = `${staff}/${id}`;
  const review = `${officePath}/submissions/1`;
  assert.match(await mira.page('/assignments'), /Анализ источников/);
  assert.equal((await mark.get(studentPath)).status, 404);
  assert.equal((await mark.post(studentPath + '/submit', { revision: '0', text: 'Чужая группа' })).status, 404);
  assert.equal((await other.get(officePath)).status, 404);
  assert.equal((await mira.post(studentPath + '/submit', { revision: '0', link: 'javascript:alert(1)' })).status, 422);
  const work = { revision: '0', text: 'Первый текст <доклад>', link: 'https://example.test/work' };
  assert.equal((await mira.post(studentPath + '/submit', { ...work, _csrf: 'wrong' })).status, 403);
  assert.equal((await mira.post(studentPath + '/submit', work)).status, 303);
  assert.equal((await mira.post(studentPath + '/submit', work)).status, 303);
  assert.match(await mira.page(studentPath), /Сдано/);
  assert.doesNotMatch(await peer.page(studentPath), /Первый текст/);
  assert.match(await teacher.page(staff), /1\s+работа на проверке/);
  assert.match(await teacher.page(officePath), /Мира Луговая[\s\S]*Первый текст &lt;доклад&gt;[\s\S]*https:\/\/example.test\/work/);
  const updated = { revision: '1', text: 'Обновлённая работа' };
  assert.equal((await mira.post(studentPath + '/submit', updated)).status, 303);
  assert.equal((await teacher.post(review, { revision: '1', status: 'reviewed' })).status, 409);
  assert.equal((await teacher.post(review, { revision: '2', status: 'returned' })).status, 422);
  assert.equal((await teacher.post(review, { revision: '2', status: 'returned', feedback: 'Уточните вывод.' })).status, 303);
  assert.match(await mira.page(studentPath), /На доработке[\s\S]*Уточните вывод/);
  now = new Date('2026-11-25T05:00:00Z');
  assert.equal((await peer.post(studentPath + '/submit', work)).status, 409);
  assert.equal((await mira.post(studentPath + '/submit', { revision: '2', text: 'Уточнённый вывод' })).status, 303);
  assert.equal((await teacher.post(review, { revision: '3', status: 'reviewed', feedback: 'Зачтено.' })).status, 303);
  assert.match(await mira.page(studentPath), /Проверено[\s\S]*Зачтено/);
  assert.equal((await mira.post(studentPath + '/submit', { revision: '3', text: 'Поздняя замена' })).status, 409);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM assignment_submissions').get().total, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
