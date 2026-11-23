import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo, setupTeacherDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const cookie = response => response.headers.get('set-cookie').split(';')[0];
const token = page => page.match(/name="_csrf" value="([^"]+)"/)?.[1];
const get = (app, path, session) => app.request(path, { headers: { cookie: session } });
const post = (app, path, session, fields) => app.request(path, {
  method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields),
});

async function login(app, path, account) {
  const form = await app.request(path);
  const response = await post(app, path, cookie(form), { ...account, _csrf: token(await form.text()) });
  assert.equal(response.status, 303);
  return cookie(response);
}

test('офис публикует аудиторию, а расписание и прочтения следуют за группой и студентом', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const accounts = await setupDemo(db);
  const office = await setupOfficeDemo(db);
  const teacher = await setupTeacherDemo(db);
  const app = createApp(db, { secret: 'room-publication-test-secret-with-32-bytes', secure: true });
  const staff = await login(app, '/office/login', office);
  const instructor = await login(app, '/office/login', teacher);
  const mira = await login(app, '/login', accounts.find(account => account.login === 'mira'));
  const mark = await login(app, '/login', accounts.find(account => account.login === 'mark'));
  const lida = await login(app, '/login', accounts.find(account => account.login === 'lida'));
  db.exec(`
    INSERT INTO lessons VALUES
      (601, 'Р-21', 'Семинар сегодня', 'А. Л. Белова', '2026-11-23', '09:00', '10:30', '400'),
      (602, 'Р-21', 'Семинар в декабре', 'А. Л. Белова', '2026-12-01', '09:00', '10:30', '401');
    INSERT INTO change_reads VALUES (1, 1);
  `);

  const path = '/office/schedule/601';
  assert.equal((await app.request(path)).headers.get('location'), '/office/login');
  for (const [session, landing] of [[instructor, '/office/gradebook'], [mira, '/']]) {
    assert.equal((await get(app, path, session)).status, 403);
    const csrf = token(await (await get(app, landing, session)).text());
    assert.ok(csrf);
    assert.equal((await post(app, path, session, { _csrf: csrf, room: '505А' })).status, 403);
  }

  assert.match(await (await get(app, '/office', staff)).text(), /href="\/office\/schedule"/);
  const list = await (await get(app, '/office/schedule', staff)).text();
  assert.match(list, /href="\/office\/schedule\/601"/);
  assert.doesNotMatch(list, /Семинар в декабре/);
  assert.match(await (await get(app, '/office/schedule?date=2026-12-01', staff)).text(), /href="\/office\/schedule\/602"/);
  const preview = await (await get(app, path, staff)).text();
  for (const label of [/Семинар сегодня/, /Р-21/, /А\. Л\. Белова/, /23 ноября 2026/, /400/, /Опубликовать/]) {
    assert.match(preview, label);
  }
  const csrf = token(preview);
  assert.ok(csrf);

  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM room_changes').get().total, 2);
  assert.equal((await post(app, path, staff, { room: '505А' })).status, 403);
  const publish = (room, target = path) => post(app, target, staff, { _csrf: csrf, room });
  assert.equal((await publish('505А', '/office/schedule/999')).status, 404);
  for (const room of [' ', '400', '505\nА', 'а'.repeat(61)]) {
    assert.equal((await publish(room)).status, 422);
  }
  assert.equal((await post(app, path, staff, [['_csrf', csrf], ['room', '505А'], ['room', '505Б']])).status, 422);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM room_changes').get().total, 2);

  const published = await publish('  505А  ');
  assert.equal(published.status, 303);
  assert.equal(published.headers.get('location'), path);
  const result = await (await get(app, path, staff)).text();
  assert.match(result, /опубликован/i);
  assert.match(result, /505А/);
  assert.doesNotMatch(result, /Опубликовать/);
  assert.equal((await publish('505А')).status, 303);
  assert.equal((await publish('505Б')).status, 409);
  const publication = db.prepare(`
    SELECT c.id, c.new_room, a.login, p.published_at
    FROM room_changes c JOIN room_change_publications p ON p.change_id = c.id
    JOIN staff_accounts a ON a.id = p.staff_id WHERE c.lesson_id = 601
  `).get();
  assert.equal(publication.new_room, '505А');
  assert.equal(publication.login, office.login);
  assert.ok(Number.isFinite(Date.parse(publication.published_at)));
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM room_change_publications').get().total, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM change_reads WHERE student_id = 1 AND change_id = 1').get().total, 1);

  db.prepare("UPDATE staff_accounts SET role = 'admin' WHERE login = ?").run(office.login);
  assert.equal((await publish('506Б', '/office/schedule/602')).status, 303);
  const today = await (await get(app, '/', mira)).text();
  assert.match(today, /Аудитория 505А[\s\S]*Было 400/);
  assert.equal((await post(app, `/read/${publication.id}`, mira, { _csrf: token(today) })).status, 303);
  const week = await (await get(app, '/schedule?date=2026-12-01', mira)).text();
  assert.match(week, /id="lesson-602"[\s\S]*506Б[\s\S]*Было 401/);
  const notices = await (await get(app, '/notices?view=unread', mira)).text();
  assert.match(notices, /href="\/schedule\?date=2026-12-01#lesson-602"/);
  assert.doesNotMatch(notices, /505А/);
  assert.match(await (await get(app, '/notices?view=unread', lida)).text(), /505А/);
  const otherNotices = await (await get(app, '/notices', mark)).text();
  const blockedRead = await post(app, '/notices/read', mark, {
    _csrf: token(otherNotices), kind: 'room', event: publication.id,
  });
  assert.equal(blockedRead.status, 404);
  assert.deepEqual({ ...db.prepare('SELECT student_id FROM change_reads WHERE change_id = ?').get(publication.id) }, {
    student_id: 1,
  });
  for (const studentPath of ['/', '/schedule?date=2026-12-01', '/notices']) {
    assert.doesNotMatch(await (await get(app, studentPath, mark)).text(), /505А|506Б|Семинар сегодня|Семинар в декабре/);
  }
});
