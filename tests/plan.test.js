import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'local-test-secret-for-individual-plan', secure: true };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)?.[1];
const get = (app, path, session) => app.request(path, { headers: { cookie: session } });
const post = (app, path, session, fields) => app.request(path, {
  method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields),
});
const body = async (app, session) => (await get(app, '/plan', session)).text();
const courses = html => html.split('<section id="electives"')[0];

async function signIn(app, accounts, login) {
  const account = accounts.find(profile => profile.login === login);
  const form = await app.request('/login');
  const response = await post(app, '/login', cookie(form), { ...account, _csrf: csrf(await form.text()) });
  assert.equal(response.status, 303);
  const session = cookie(response);
  return { session, token: csrf(await body(app, session)) };
}

function change(app, { session, token }, block, selected, action = 'choice') {
  return post(app, `/plan/${block}/${action}`, session, { _csrf: token, option: selected, studentId: 2 });
}

test('личный план показывает свои баллы, после записи и отзыва обновляются курсы и кредиты', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'deanery-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'students.sqlite');
  let db = openDatabase(file);
  t.after(() => db.close());
  const accounts = await setupDemo(db);
  let app = createApp(db, options);
  assert.equal((await app.request('/plan')).headers.get('location'), '/login');
  const mira = await signIn(app, accounts, 'mira');
  const mark = await signIn(app, accounts, 'mark');

  const initial = await body(app, mira.session);
  assert.match(initial, /Освоено <strong>9 из 15 з\. е\./);
  assert.doesNotMatch(courses(initial), /Дипломатия Восточной Азии/);
  assert.match(initial, /Запись закрыта/);
  assert.doesNotMatch(initial, /Визуализация экономических данных/);
  assert.equal((await change(app, mark, 11, 111)).status, 404);
  assert.equal((await change(app, mira, 11, 121)).status, 404);
  assert.equal((await change(app, mira, 14, 141)).status, 409);
  assert.equal((await post(app, '/plan/11/choice', mira.session, { option: 111 })).status, 403);

  const selected = await change(app, mira, 11, 111);
  assert.equal(selected.status, 303);
  assert.equal(selected.headers.get('location'), '/plan#choice-11');
  assert.equal((await change(app, mira, 11, 111)).status, 303);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM plan_choices WHERE student_id = 1').get().total, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM plan_choice_history WHERE student_id = 1').get().total, 1);
  let page = await body(app, mira.session);
  assert.match(page, /Освоено <strong>9 из 18 з\. е\./);
  assert.match(courses(page), /Дипломатия Восточной Азии[\s\S]*По выбору/);
  assert.match(page, /Включён в план/);
  assert.match(page, /Запись на курс · Дипломатия Восточной Азии/);
  const other = await body(app, mark.session);
  assert.match(other, /Освоено <strong>9 из 16 з\. е\./);
  assert.doesNotMatch(other, /Запись на курс · Дипломатия Восточной Азии/);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM plan_choices WHERE student_id = 2').get().total, 0);
  db.exec(`INSERT INTO grades (student_id, subject, assessment, result) VALUES
    (1, 'Дипломатия Восточной Азии', 'Зачёт', 'Не зачтено'),
    (1, 'Дипломатия Восточной Азии', 'Зачёт', 'Зачтено')`);
  assert.match(await body(app, mira.session), /Освоено <strong>12 из 18 з\. е\./);

  db.close();
  db = openDatabase(file);
  app = createApp(db, options);
  assert.deepEqual(await setupDemo(db), []);
  assert.match(courses(await body(app, mira.session)), /Дипломатия Восточной Азии/);
  assert.equal((await change(app, mira, 11, 111, 'withdraw')).status, 303);
  page = await body(app, mira.session);
  assert.doesNotMatch(courses(page), /Дипломатия Восточной Азии/);
  assert.match(page, /Запись отменена · Дипломатия Восточной Азии/);
});

test('места общие для групп, неудачная замена сохраняет исходную запись', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const accounts = await setupDemo(db);
  const app = createApp(db, options);
  const mira = await signIn(app, accounts, 'mira');
  const sonya = await signIn(app, accounts, 'sonya');
  const lida = await signIn(app, accounts, 'lida');
  const roman = await signIn(app, accounts, 'roman');
  assert.equal((await change(app, lida, 11, 112)).status, 303);
  assert.equal((await change(app, mira, 11, 111)).status, 303);
  const responses = await Promise.all([change(app, roman, 11, 111), change(app, sonya, 11, 111)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [303, 409]);

  const full = await change(app, lida, 11, 111);
  assert.equal(full.status, 409);
  const fullPage = await full.text();
  assert.match(fullPage, /Нет мест/);
  assert.match(courses(fullPage), /Медиа и политика Европы/);

  assert.equal((await change(app, mira, 11, 111, 'withdraw')).status, 303);
  assert.equal((await change(app, lida, 11, 111)).status, 303);
  assert.equal((await change(app, lida, 11, 112, 'withdraw')).status, 303);
  const replacedPage = await body(app, lida.session);
  assert.match(courses(replacedPage), /Дипломатия Восточной Азии/);
  assert.match(replacedPage, /Курс заменён · Медиа и политика Европы → Дипломатия Восточной Азии/);
  assert.doesNotMatch(replacedPage, /Запись отменена · Медиа и политика Европы/);

  db.exec("UPDATE students SET group_code = 'Э-11' WHERE id = 1001");
  assert.match(courses(await body(app, lida.session)), /Дипломатия Восточной Азии/);
  assert.equal((await change(app, lida, 11, 111, 'withdraw')).status, 404);
});
