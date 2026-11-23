import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { openDatabase } from '../src/db/open.js';
import { weekForStudent, changesForStudent, markChangeRead, isDate, weekStartOf } from '../src/schedule/schedule.js';
import { seedDemoData } from '../demo/seed.js';
import { setupDemo } from '../demo/setup.js';
import { createApp } from '../src/server.js';

const monday = '2026-11-23';
let db;
beforeEach(() => {
  db = openDatabase();
  seedDemoData(db);
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
  assert.match(body, /<h1>Расписание занятий<\/h1>/);
  assert.match(body, /href="\/schedule" aria-current="page">Пары<\/a>/);
  assert.match(body, /Пары вашей группы, преподаватели, аудитории и переносы/);
  assert.match(body, /href="\/calendar\?date=2026-11-23">Все события недели<\/a>/);
  assert.match(body, /Английский язык/);
  assert.match(body, /10:40/);
  assert.match(body, /ауд\. 307/);
  assert.match(body, /Было 214/);
  assert.equal((body.match(/Английский язык/g) ?? []).length, 1, 'выбранный день не дублируется в неделе');
  assert.match(body, /История региона/);
  assert.match(body, /Среда, 25 ноября 2026/);
  assert.match(body, /href="\?date=2026-11-23#week"/);
  assert.equal((body.match(/id="lesson-101"/g) ?? []).length, 1, 'якорь пары не дублируется');
});

test('переход с «Сегодня» и из уведомлений ведёт к доступной карточке перенесённой пары', async () => {
  const [mira] = await setupDemo(db);
  const app = createApp(db, appOptions);
  const session = await login(app, mira);

  for (const source of ['/', '/notices']) {
    const page = await (await get(app, source, session)).text();
    const link = page.match(/href="(\/schedule\?date=2026-11-23#lesson-101)"/);
    assert.ok(link, `есть ссылка на перенос из ${source}`);
    const { pathname, search, hash } = new URL(link[1], 'http://localhost');
    const id = hash.slice(1);
    const schedule = await (await get(app, pathname + search, session)).text();
    const row = daySection(schedule).match(new RegExp(`<div id="${id}"([^>]*)>([\\s\\S]*?)</div>`));
    assert.ok(row, 'в выбранном дне есть пара по якорю');
    assert.match(row[1], /tabindex="-1"/);
    assert.match(row[2], /datetime="10:40"[\s\S]*Английский язык/);
    assert.match(row[2], /Сейчас в ауд\. 307[\s\S]*Было 214/);
  }
});

test('день и неделя фильтруются по дате, пустая неделя имеет понятный текст', async () => {
  const [mira] = await setupDemo(db);
  const app = createApp(db, appOptions);
  const session = await login(app, mira);

  const wednesday = await (await get(app, '/schedule?date=2026-11-25', session)).text();
  assert.match(daySection(wednesday), /История региона/);
  assert.doesNotMatch(daySection(wednesday), /Английский язык/);
  assert.match(wednesday, /href="\?date=2026-11-25#day"/);
  assert.match(wednesday, /Число занятий — 1" aria-current="date"/);
  assert.match(wednesday, /href="\?date=2026-11-30#calendar"/);

  const empty = await (await get(app, '/schedule?date=2026-11-30', session)).text();
  assert.match(empty, /В этот день пар нет/);
  assert.match(empty, /На этой неделе пар нет/);

  const fallback = await (await get(app, '/schedule?date=2026-02-30', session)).text();
  assert.match(fallback, /Английский язык/);
});

test('версия для печати сохраняет выбранную неделю, переносы и границы группы', async () => {
  const [mira, mark] = await setupDemo(db);
  const app = createApp(db, appOptions);
  const path = '/schedule?date=2026-11-25&view=print';
  const guest = await app.request(path);
  assert.equal(guest.status, 303);

  const miraSession = await login(app, mira);
  const page = await (await get(app, path, miraSession)).text();
  assert.match(page, /Расписание на неделю/);
  assert.match(page, /Группа Р-21 · 23–29 ноября 2026/);
  assert.match(page, /ауд\. 307[\s\S]*Было 214/);
  assert.match(page, /История региона/);
  assert.doesNotMatch(page, /Микроэкономика|week-picker/);
  assert.equal((page.match(/Английский язык/g) ?? []).length, 1);

  const markSession = await login(app, mark);
  const otherPage = await (await get(app, path, markSession)).text();
  assert.match(otherPage, /Микроэкономика/);
  assert.doesNotMatch(otherPage, /Английский язык|307/);

  const farBoundary = await get(app, '/schedule?date=9999-12-31&view=print', miraSession);
  assert.equal(farBoundary.status, 200);
  assert.match(await farBoundary.text(), /27–31 декабря 9999/);
  const earlyBoundary = await get(app, '/schedule?date=0000-01-01', miraSession);
  assert.equal(earlyBoundary.status, 200);
  assert.doesNotMatch(await earlyBoundary.text(), /NaN|undefined|\?date=-/);
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
