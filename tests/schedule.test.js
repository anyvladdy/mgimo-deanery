import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../src/db/open.js';
import { weekForStudent, changesForStudent, markChangeRead, isDate, weekStartOf } from '../src/schedule/schedule.js';
import { setupDemo } from '../demo/setup.js';
import { createApp } from '../src/server.js';

const monday = '2026-11-23';
const fixture = readFileSync(new URL('../demo/seed.sql', import.meta.url), 'utf8');
let db;
beforeEach(() => {
  db = openDatabase();
  db.exec(fixture);
});
afterEach(() => db.close());

const appOptions = { secret: 'local-test-secret-for-schedule-pages', secure: true };

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
  return cookie(result);
}

function daySection(page) {
  const start = page.indexOf('<section id="day"');
  const end = page.indexOf('</section>', start);
  return page.slice(start, end);
}

test('учебная неделя начинается с понедельника, некорректная дата отклоняется', () => {
  assert.equal(weekStartOf('2026-11-25'), '2026-11-23');
  assert.equal(weekStartOf('2026-11-23'), '2026-11-23');
  assert.equal(isDate('2026-11-23'), true);
  assert.equal(isDate('2026-02-30'), false);
});

test('расписание Миры показывает день, неделю и обе аудитории', async () => {
  const [mira] = await setupDemo(db);
  const app = createApp(db, appOptions);
  const session = await login(app, mira);
  const profile = await (await get(app, '/profile', session)).text();
  assert.match(profile, /href="\/schedule"/);
  const body = await (await get(app, '/schedule', session)).text();
  assert.match(body, /Английский язык/);
  assert.match(body, /10:40/);
  assert.match(body, /ауд\. 307/);
  assert.match(body, /Было 214/);
  assert.match(body, /История региона/);
  assert.match(body, /Среда, 25 ноября 2026/);
  assert.match(body, /href="\?date=2026-11-23#week"/);
  assert.equal((body.match(/id="lesson-101"/g) ?? []).length, 1, 'якорь пары не дублируется');
});

test('день и неделя фильтруются по дате, пустая неделя имеет понятный текст', async () => {
  const [mira] = await setupDemo(db);
  const app = createApp(db, appOptions);
  const session = await login(app, mira);

  const wednesday = await (await get(app, '/schedule?date=2026-11-25', session)).text();
  assert.match(daySection(wednesday), /История региона/);
  assert.doesNotMatch(daySection(wednesday), /Английский язык/);
  assert.match(wednesday, /href="\?date=2026-11-25#day"/);

  const empty = await (await get(app, '/schedule?date=2026-11-30', session)).text();
  assert.match(empty, /В этот день пар нет/);
  assert.match(empty, /На этой неделе пар нет/);

  const fallback = await (await get(app, '/schedule?date=2026-02-30', session)).text();
  assert.match(fallback, /Английский язык/);
});

test('расписание Марка содержит только его группу, гость отправляется на вход', async () => {
  const [, mark] = await setupDemo(db);
  const app = createApp(db, appOptions);
  const guest = await app.request('/schedule');
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), '/login');

  const session = await login(app, mark);
  const body = await (await get(app, '/schedule', session)).text();
  assert.match(body, /Микроэкономика/);
  assert.match(body, /ауд\. 215/);
  assert.doesNotMatch(body, /Английский язык/);
  assert.doesNotMatch(body, /307/);
  assert.equal((body.match(/id="lesson-201"/g) ?? []).length, 1);
});

test('один перенос меняет текущую аудиторию и сохраняет прежнюю', () => {
  const [change] = changesForStudent(db, 1, monday);
  assert.equal(change.scheduled_room, '214');
  assert.equal(change.current_room, '307');
  assert.deepEqual(weekForStudent(db, 1, monday)[0], change);
  assert.deepEqual(weekForStudent(db, 1, '2026-11-16'), []);
});

test('прочтение личное, повторяемое, история остаётся в расписании', () => {
  db.exec('INSERT INTO students SELECT 3, full_name, faculty, program, year, group_code FROM students WHERE id = 1');
  markChangeRead(db, 1, 1);
  markChangeRead(db, 1, 1);
  assert.equal(changesForStudent(db, 1, monday)[0].is_read, 1);
  assert.equal(changesForStudent(db, 3, monday)[0].is_read, 0);
  assert.equal(weekForStudent(db, 1, monday)[0].current_room, '307');
});

test('чужая группа получает свою пару и не может отметить чужой перенос', () => {
  assert.deepEqual(weekForStudent(db, 2, monday).map(row => row.lesson_id), [201]);
  assert.deepEqual(changesForStudent(db, 2, monday), []);
  markChangeRead(db, 2, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM change_reads').get().n, 0);
});
