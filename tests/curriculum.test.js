import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

test('черновик видит только офис, а атомарная публикация архивирует версию и сохраняет оценки', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const account = await setupOfficeDemo(db);
  const app = createApp(db, { secret: 'curriculum-test-secret-for-demo-only' });
  const cookie = response => response.headers.get('set-cookie').split(';')[0];
  const csrf = html => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const revision = html => html.match(/name="revision" value="([^"]+)"/)?.[1];
  const get = (path, session) => app.request(path, { headers: { cookie: session } });
  const post = (path, session, fields) => app.request(path, {
    method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields),
  });
  async function login(path, credentials) {
    const before = await app.request(path);
    const after = await post(path, cookie(before), { ...credentials, _csrf: csrf(await before.text()) });
    assert.equal(after.status, 303);
    return cookie(after);
  }
  const staff = await login('/office/login', account);
  const student = await login('/login', mira);
  const token = csrf(await (await get('/office', staff)).text());
  const send = (path, fields = {}) => post(path, staff, { _csrf: token, ...fields });
  const groupPath = `/office/curriculum/groups/${encodeURIComponent('Р-21')}`;
  const draft = await send(`${groupPath}/draft`);
  assert.equal(draft.status, 303);
  const current = draft.headers.get('location');
  assert.equal((await send(`${groupPath}/draft`)).headers.get('location'), current);
  const originalRevision = revision(await (await get(current, staff)).text());
  const discipline = 'Методы анализа источников';
  const edits = [
    { action: 'remove', subject: 'Регионоведение', assessment: 'Экзамен' },
    { action: 'save', subject: 'Английский язык', assessment: 'Экзамен', credits: '6' },
    { action: 'save', subject: discipline, assessment: 'Зачёт', credits: '2' },
  ];
  for (const edit of edits) assert.equal((await send(`${current}/courses`, edit)).status, 303);
  const preview = await (await get(current, staff)).text();
  assert.match(preview, /Что изменится после публикации[\s\S]*Кредиты · 5 → 6/);
  assert.match(preview, /Убирается из действующего плана/);
  assert.equal((await get(current, student)).status, 403);
  assert.doesNotMatch(await (await get('/plan', student)).text(), new RegExp(discipline));
  assert.equal((await send(`${current}/publish`, { revision: originalRevision })).status, 409);

  const sheet = await send('/office/gradebook', { course: JSON.stringify(['Р-21', 'Регионоведение', 'Экзамен']), kind: 'main' });
  assert.equal(sheet.status, 303);
  const blocked = await send(`${current}/publish`, { revision: revision(preview) });
  assert.equal(blocked.status, 409);
  assert.match(await blocked.text(), /открыта ведомость/);
  const sheetPath = sheet.headers.get('location');
  for (const id of [1, 1001, 1002]) {
    assert.equal((await send(`${sheetPath}/rows/${id}`, { attendance: 'absent', result: '' })).status, 303);
  }
  assert.equal((await send(`${sheetPath}/publish`)).status, 303);
  assert.equal((await send(`${current}/publish`, { revision: revision(preview) })).status, 303);
  assert.equal((await send(`${current}/publish`, { revision: revision(preview) })).status, 303);
  const plan = await (await get('/plan', student)).text();
  assert.match(plan, /Действующая версия № 2/);
  assert.match(plan, /Освоено <strong>9 из 11 з\. е\./);
  assert.match(plan, /Английский язык[\s\S]*Из прежнего плана[\s\S]*5 з\. е\./);
  assert.match(plan, new RegExp(discipline));
  assert.doesNotMatch(plan, /<dt>(?:<a[^>]+>)?Регионоведение/);
  assert.doesNotMatch(await (await get('/grades?view=pending', student)).text(), /\/history">Регионоведение/);
  assert.match(await (await get('/grades/3/history', student)).text(), /Регионоведение/);
  assert.equal((await send(`${current}/courses`, edits[0])).status, 409);
  assert.match(await (await get(groupPath, staff)).text(),
    /Версия № 2[\s\S]*Анна Борисова[\s\S]*Действующая[\s\S]*Версия № 1[\s\S]*Архив/);
  assert.match(await (await get('/office/curriculum', staff)).text(), /Р-21[\s\S]*3 дисциплины/);
  assert.match(await (await get(sheetPath, staff)).text(), /Опубликована/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
