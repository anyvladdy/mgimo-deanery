import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'local-test-secret-for-today-pages', secure: true };

function cookie(response) {
  return response.headers.get('set-cookie').split(';')[0];
}

function token(page) {
  const match = page.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match, 'форма содержит CSRF-токен');
  return match[1];
}

function post(app, path, jar, fields) {
  return app.request(path, { method: 'POST', headers: { cookie: jar }, body: new URLSearchParams(fields) });
}

function get(app, path, jar) {
  return app.request(path, { headers: { cookie: jar } });
}

async function login(app, account) {
  const form = await app.request('/login');
  const guestCookie = cookie(form);
  const result = await post(app, '/login', guestCookie, { ...account, _csrf: token(await form.text()) });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/');
  return cookie(result);
}

test('Сегодня показывает ближайшую пару, обе аудитории и навигацию', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const app = createApp(db, options);
  const session = await login(app, mira);

  const response = await get(app, '/', session);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /Сегодня/);
  assert.match(page, /Учебный день/);
  assert.match(page, /Понедельник, 23 ноября 2026/);
  assert.match(page, /Ближайшая пара/);
  assert.match(page, /Английский язык/);
  assert.match(page, /10:40/);
  assert.match(page, /Аудитория 307/);
  assert.match(page, /Было 214/);
  assert.match(page, /href="\/schedule\?date=2026-11-23#lesson-101"/);
  assert.match(page, /class="nav-link is-active" href="\/" aria-current="page">Сегодня/);
  assert.match(page, /href="\/schedule"/);
  assert.match(page, /href="\/grades"/);
  assert.match(page, /href="\/requests"/);
  assert.match(page, /action="\/read\/1"/);
  assert.doesNotMatch(page, /Конкурсный концепт/);
});

test('Прочитано убирает перенос с главной, но оставляет историю в неделе', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const app = createApp(db, options);
  const session = await login(app, mira);

  const page = await (await get(app, '/', session)).text();
  const read = await post(app, '/read/1', session, { _csrf: token(page) });
  assert.equal(read.status, 303);
  assert.equal(read.headers.get('location'), '/');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM change_reads WHERE student_id = 1 AND change_id = 1').get().n, 1);

  const after = await (await get(app, '/', session)).text();
  assert.match(after, /Аудитория 307/);
  assert.doesNotMatch(after, /Было 214/);
  assert.doesNotMatch(after, /action="\/read\/1"/);
  assert.match(after, /Перенос отмечен прочитанным/);

  const week = await (await get(app, '/schedule', session)).text();
  assert.match(week, /Было 214/);
});

test('Сегодня Марка показывает его пару и не открывает чужие данные', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [, mark] = await setupDemo(db);
  const app = createApp(db, options);

  const guest = await app.request('/');
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), '/login');

  const session = await login(app, mark);
  const page = await (await get(app, '/', session)).text();
  assert.match(page, /Микроэкономика/);
  assert.match(page, /Аудитория 215/);
  assert.doesNotMatch(page, /Английский язык/);
  assert.doesNotMatch(page, /307/);
  assert.doesNotMatch(page, /action="\/read\/1"/);
});

test('Сегодня показывает ближайшую и текущую пару, переход между парами и завершение дня', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  db.exec(`
    INSERT INTO lessons VALUES
      (103, 'Р-21', 'Семинар по фонетике', 'А. Л. Белова', '2026-11-23', '12:20', '13:50', '216');
    INSERT INTO room_changes VALUES (3, 103, '322');
  `);
  let instant = '2026-11-23T07:39:59Z';
  const app = createApp(db, { ...options, now: () => new Date(instant) });
  const session = await login(app, mira);
  const markSession = await login(app, mark);
  const today = async (jar = session) => (await get(app, '/', jar)).text();

  const before = await today();
  assert.match(before, /Ближайшая пара[\s\S]*Английский язык/);
  const laterLink = before.match(/href="(\/schedule\?date=2026-11-23)#(lesson-103)">Семинар по фонетике/);
  assert.ok(laterLink);
  const laterSchedule = await (await get(app, laterLink[1], session)).text();
  assert.match(laterSchedule, new RegExp(`id="${laterLink[2]}"[^>]*>[\\s\\S]*?ауд\\. 322`));

  instant = '2026-11-23T07:40:00Z';
  const atStart = await today();
  assert.match(atStart, /Пара идёт[\s\S]*Английский язык[\s\S]*Аудитория 307/);
  const read = await post(app, '/read/1', session, { _csrf: token(atStart) });
  assert.equal(read.status, 303);
  assert.match(await today(), /Пара идёт[\s\S]*Аудитория 307[\s\S]*Перенос отмечен прочитанным/);
  const otherToday = await today(markSession);
  assert.match(otherToday, /Пара идёт[\s\S]*Микроэкономика[\s\S]*Аудитория 215/);
  assert.doesNotMatch(otherToday, /Английский язык|Семинар по фонетике|Аудитория 307/);

  instant = '2026-11-23T09:10:00Z';
  const between = await today();
  assert.match(between, /Ближайшая пара[\s\S]*Семинар по фонетике[\s\S]*Аудитория 322/);
  assert.doesNotMatch(between, /Английский язык|Пара идёт/);

  instant = '2026-11-23T09:20:00Z';
  assert.match(await today(), /Пара идёт[\s\S]*Семинар по фонетике/);
  instant = '2026-11-23T10:50:00Z';
  const after = await today();
  assert.match(after, /На сегодня пары закончились/);
  assert.match(after, /href="\/schedule\?date=2026-11-23">Открыть расписание/);
  assert.doesNotMatch(after, /Английский язык|Семинар по фонетике|Ближайшая пара/);
  const week = await (await get(app, '/schedule?date=2026-11-23', session)).text();
  assert.match(week, /id="lesson-101"[\s\S]*Было 214/);
});

test('московская полночь синхронно меняет Сегодня, расписание и срок чтения напоминаний', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  db.exec(`
    INSERT INTO grades (id, student_id, subject, assessment, exam_date) VALUES
      (103, 1, 'Аттестация во вторник', 'Зачёт', '2026-11-24'),
      (104, 1, 'Аттестация в среду', 'Зачёт', '2026-11-25');
  `);
  let instant = '2026-11-24T20:59:59Z';
  const app = createApp(db, { ...options, now: () => new Date(instant) });
  const session = await login(app, mira);
  const markSession = await login(app, mark);
  const page = async (path, jar = session) => (await get(app, path, jar)).text();
  const unread = '/notices?view=unread';

  const tuesday = await page('/');
  assert.match(tuesday, /Вторник, 24 ноября 2026/);
  assert.match(tuesday, /Сегодня пар нет/);
  assert.match(tuesday, /Аттестация во вторник/);
  assert.match(await page('/schedule'), /id="day-title">Вторник, 24 ноября 2026/);

  const feed = await page(unread);
  assert.match(feed, /Аттестация во вторник/);
  const exam = { kind: 'exam', event: '103', date: '2026-11-24', _csrf: token(feed) };
  assert.equal((await post(app, '/notices/read', session, exam)).status, 303);
  assert.doesNotMatch(await page(unread), /Аттестация во вторник/);

  instant = '2026-11-24T21:00:00Z';
  const wednesday = await page('/');
  assert.match(wednesday, /Среда, 25 ноября 2026/);
  assert.match(wednesday, /История региона/);
  assert.match(wednesday, /href="\/schedule\?date=2026-11-25#lesson-102"/);
  assert.match(wednesday, /Аттестация в среду/);
  assert.doesNotMatch(wednesday, /Аттестация во вторник/);
  assert.match(await page('/schedule'), /id="day-title">Среда, 25 ноября 2026/);
  assert.match(await page('/schedule?date=2026-02-30'), /id="day-title">Среда, 25 ноября 2026/);
  const past = await page('/schedule?date=2026-11-23');
  assert.match(past, /id="day-title">Понедельник, 23 ноября 2026[\s\S]*id="lesson-101"/);
  assert.match(past, /href="\?date=2026-11-25#calendar"/);
  assert.doesNotMatch(await page('/schedule?date=2026-11-23', markSession), /lesson-101|Английский язык/);

  const afterMidnight = await page('/notices');
  assert.match(afterMidnight, /href="\/schedule\?date=2026-11-23#lesson-101"/);
  assert.match(afterMidnight, /Аттестация в среду/);
  assert.doesNotMatch(afterMidnight, /Аттестация во вторник/);
  assert.equal((await post(app, '/notices/read', session, exam)).status, 404);
  const nextExam = { ...exam, event: '104', date: '2026-11-25' };
  const otherFeed = await page('/notices', markSession);
  assert.doesNotMatch(otherFeed, /grade-10[34]|Аттестация (во вторник|в среду)/);
  assert.equal((await post(app, '/notices/read', markSession, { ...nextExam, _csrf: token(otherFeed) })).status, 404);
  assert.equal((await post(app, '/notices/read', session, nextExam)).status, 303);
  assert.doesNotMatch(await page(unread), /Аттестация в среду/);
  assert.deepEqual(db.prepare('SELECT student_id, grade_id FROM assessment_reminder_reads ORDER BY grade_id').all()
    .map(row => [row.student_id, row.grade_id]), [[1, 103], [1, 104]]);
});
