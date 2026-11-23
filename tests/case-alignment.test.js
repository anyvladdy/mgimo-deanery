import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const prototypeNote = /<p class="prototype-note">Конкурсный прототип цифрового деканата<\/p>/;
const csrf = html => html.match(/name="_csrf" value="([^"]+)"/)[1];
const cookie = response => response.headers.get('set-cookie').split(';')[0];

function client(app, session) {
  return {
    get: path => app.request(path, { headers: { cookie: session } }),
    post: (path, fields) => app.request(path, {
      method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields),
    }),
  };
}

async function login(app, account) {
  const page = await app.request('/login');
  const login = await client(app, cookie(page)).post('/login', { ...account, _csrf: csrf(await page.text()) });
  assert.equal(login.status, 303);
  return client(app, cookie(login));
}

test('на входе для каждой роли видно, что кабинет — конкурсный прототип', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const app = createApp(db, { secret: 'case-alignment-test-session-secret' });
  for (const path of ['/login', '/office/login']) {
    const page = await app.request(path);
    assert.equal(page.status, 200);
    assert.match(await page.text(), prototypeNote);
  }
});

test('личное напоминание ведёт к назначенной аттестации и следует за её датой и результатом', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const app = createApp(db, { secret: 'case-alignment-test-session-secret' });
  const student = await login(app, mira);
  const other = await login(app, mark);
  db.prepare('INSERT INTO grades (student_id, subject, assessment, exam_date) VALUES (1, ?, ?, ?)')
    .run('Прошедший зачёт', 'Зачёт', '2026-11-22');

  const link = '/grades?view=pending#grade-3';
  const today = await (await student.get('/')).text();
  assert.ok(today.includes(`href="${link}"`));
  assert.match(today, prototypeNote);
  assert.doesNotMatch(today, /Прошедший зачёт/);

  const feed = await (await student.get('/notices?view=unread')).text();
  assert.ok(feed.includes(`href="${link}"`));
  assert.match(feed, /Напоминание о сессии/);
  assert.doesNotMatch(feed, /Прошедший зачёт/);
  const path = link.split('#')[0];
  const grade = await (await student.get(path)).text();
  assert.match(grade, /id="grade-3"[\s\S]*Регионоведение[\s\S]*15 декабря 2026/);

  const secondFeed = await (await other.get('/notices')).text();
  assert.doesNotMatch(secondFeed, /grade-3|Регионоведение/);
  assert.match(secondFeed, /grade-6/);
  const notice = { kind: 'exam', event: '3', date: '2026-12-15' };
  assert.equal((await other.post('/notices/read', { ...notice, _csrf: csrf(secondFeed) })).status, 404);
  const markRead = fields => student.post('/notices/read', { ...notice, _csrf: csrf(feed), ...fields });
  assert.equal((await markRead({})).status, 303);
  assert.equal((await markRead({})).status, 303);
  assert.ok(!(await (await student.get('/notices?view=unread')).text()).includes(link));
  assert.ok((await (await student.get('/')).text()).includes(link));

  db.prepare('UPDATE grades SET exam_date = ? WHERE id = 3').run('2026-12-22');
  assert.equal((await markRead({})).status, 404);
  assert.match(await (await student.get('/notices?view=unread')).text(), /22 декабря 2026/);
  assert.equal((await markRead({ date: '2026-12-22' })).status, 303);

  db.prepare("INSERT INTO grades (student_id, subject, assessment, result) VALUES (1, 'Регионоведение', 'Экзамен', '5')").run();
  assert.ok(!(await (await student.get('/')).text()).includes(link));
  assert.ok(!(await (await student.get('/notices')).text()).includes(link));
});
