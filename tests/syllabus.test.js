import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

test('офис публикует силлабус существующей дисциплины, студент видит его в плане', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [student] = await setupDemo(db);
  const office = await setupOfficeDemo(db);
  const app = createApp(db, { secret: 'private-local-test-secret-for-syllabuses' });
  const token = html => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const cookie = response => response.headers.get('set-cookie').split(';')[0];
  const get = (path, session) => app.request(path, { headers: { cookie: session } });
  const post = (path, session, values) => app.request(path, {
    method: 'POST', headers: { cookie: session }, body: new URLSearchParams(values),
  });
  const login = async (path, account) => {
    const form = await app.request(path);
    const response = await post(path, cookie(form), { ...account, _csrf: token(await form.text()) });
    assert.equal(response.status, 303);
    return cookie(response);
  };
  const staff = await login('/office/login', office);
  const mira = await login('/login', student);
  const path = '/office/syllabuses/new';
  const form = await (await get(path, staff)).text();
  const longRussianText = 'Обзор источников. '.repeat(65);
  const content = { subject: 'История региона', summary: '<История>', requirements: longRussianText,
    assessment: longRussianText, literature: longRussianText };
  assert.equal((await post(path, mira, { ...content, _csrf: token(await (await get('/plan', mira)).text()) })).status, 403);
  assert.equal((await post(path, staff, { ...content, subject: 'Чужая дисциплина', _csrf: token(form) })).status, 409);
  const saved = await post(path, staff, { ...content, _csrf: token(form) });
  assert.equal(saved.status, 303);
  const id = saved.headers.get('location').match(/syllabuses\/(\d+)/)[1];
  assert.match(await (await get('/plan', mira)).text(), new RegExp(`href="/syllabuses/${id}">Силлабус`));
  const results = await (await get(`/syllabuses?q=${encodeURIComponent('ИСТОРИЯ')}`, mira)).text();
  assert.match(results, /История региона/);
  assert.doesNotMatch(results, /Микроэкономика/);
  assert.match(await (await get(`/syllabuses/${id}`, mira)).text(), /&lt;История&gt;/);
  assert.equal((await post(path, staff, { ...content, _csrf: token(form) })).status, 409);
});
