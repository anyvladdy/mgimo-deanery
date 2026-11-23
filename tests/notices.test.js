import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

test('перенос и объявления относятся к группе, а отметки прочтения — к студенту', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark, lida] = await setupDemo(db);
  const app = createApp(db, { secret: 'local-test-secret-for-notifications' });
  const cookie = response => response.headers.get('set-cookie').split(';')[0];
  const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const get = (path, session) => app.request(path, { headers: { cookie: session } });
  const post = (path, session, fields) => app.request(path, {
    method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields),
  });
  const login = async account => {
    const form = await app.request('/login');
    const signed = await post('/login', cookie(form), { _csrf: csrf(await form.text()), ...account });
    assert.equal(signed.status, 303);
    return cookie(signed);
  };
  const [a, b, c] = await Promise.all([login(mira), login(mark), login(lida)]);
  const feed = '/notices?view=unread';
  const first = await (await get(feed, a)).text();
  assert.match(first, /аудитория 307, раньше 214/);
  assert.match(first, /два первичных источника/);
  const foreign = await (await get(feed, b)).text();
  assert.doesNotMatch(foreign, /307|два первичных источника/);
  assert.match(foreign, /href="\/plan#choice-12">До 27 ноября[^<]*Аналитика и данные/);
  assert.doesNotMatch(first, /\/plan#choice-12|Аналитика и данные/);
  const markPlan = await (await get('/plan', b)).text();
  assert.match(markPlan, /id="choice-12"[\s\S]*?<h3[^>]*>Аналитика и данные<\/h3>/);
  assert.doesNotMatch(await (await get('/plan', a)).text(), /id="choice-12"/);
  assert.equal((await post('/notices/read', b, {
    _csrf: csrf(foreign), kind: 'group', event: 12, view: 'unread',
  })).status, 303);
  assert.doesNotMatch(await (await get(feed, b)).text(), /\/plan#choice-12/);
  assert.match(await (await get('/notices', b)).text(), /\/plan#choice-12/);

  db.prepare('DELETE FROM plan_choice_groups WHERE block_id = ? AND group_code = ?').run(12, 'Э-11');
  const changedGroupAccess = await (await get('/notices', b)).text();
  assert.match(changedGroupAccess, /<h3>До 27 ноября[^<]*Аналитика и данные/);
  assert.doesNotMatch(changedGroupAccess, /\/plan#choice-12/);

  assert.equal((await post('/notices/read', b, { _csrf: csrf(foreign), kind: 'room', event: 1 })).status, 404);
  assert.equal((await post('/notices/read', a, { kind: 'room', event: 1 })).status, 403);
  for (const [kind, event] of [['room', 1], ['group', 11]]) {
    const read = await post('/notices/read', a, { _csrf: csrf(first), kind, event, view: 'unread' });
    assert.equal(read.status, 303);
    assert.equal(read.headers.get('location'), feed);
  }
  const remaining = await (await get(feed, a)).text();
  assert.match(remaining, /Напоминание о сессии/);
  assert.doesNotMatch(remaining, /аудитория 307, раньше 214|два первичных источника/);
  assert.equal((await post('/notices/read', a, {
    _csrf: csrf(first), kind: 'exam', event: 3, date: '2026-12-15', view: 'unread',
  })).status, 303);
  assert.match(await (await get(feed, a)).text(), /Непрочитанных уведомлений нет/);
  assert.match(await (await get('/', a)).text(), /Перенос отмечен прочитанным/);
  assert.match(await (await get(feed, c)).text(), /аудитория 307, раньше 214[\s\S]*два первичных источника|два первичных источника[\s\S]*аудитория 307, раньше 214/);
});
