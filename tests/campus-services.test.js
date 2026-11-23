import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDemoData } from '../demo/seed.js';
import { passwordRecord } from '../src/account/passwords.js';
import { openDatabase } from '../src/db/open.js';
import { applySql } from '../src/db/sql.js';
import { demoNow } from '../src/modules/clock.js';
import { resolveModules } from '../src/modules/catalog.js';
import { createApp } from '../src/server.js';

const password = 'campus-fixture-password';
const { salt, hash } = await passwordRecord(password);
const date = '2026-11-23';
const defaultBooking = { room: '214', date, start: '10:30', end: '12:30', purpose: 'Подготовка <проекта>' };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const csrf = html => html.match(/name="_csrf" value="([^"]+)"/)?.[1];

function fixture(t, selection, now = demoNow) {
  const modules = resolveModules(selection);
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  seedDemoData(db);
  const account = db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)');
  for (const [id, login] of [[1, 'mira'], [2, 'mark'], [1010, 'lev']]) {
    account.run(id, login, salt, hash);
  }
  return { db, modules, app: createApp(db, { secret: 'local-campus-services-test-secret', now }) };
}

function request(app, path, student, body) {
  return app.request(path, {
    headers: { cookie: student },
    ...(body ? { method: 'POST', body: new URLSearchParams(body) } : {}),
  });
}

async function login(app, login) {
  const entry = await app.request('/login');
  const grant = await request(app, '/login', cookie(entry), {
    login, password, _csrf: csrf(await entry.text()),
  });
  assert.equal(grant.status, 303);
  return cookie(grant);
}

async function page(app, path, student) {
  const response = await request(app, path, student);
  assert.equal(response.status, 200, path);
  return response.text();
}

test('бронь учитывает фактическую аудиторию всех групп, хранит время МСК и проверяет границы', async t => {
  let now = demoNow();
  const { app, db, modules } = fixture(t, 'core,+room-booking', () => now);
  const mira = await login(app, 'mira');
  const body = await page(app, '/room-booking?room=307', mira);
  assert.match(body, /Ауд\. 307 · 32 места/);
  assert.match(body, /10:40[\s\S]*12:10[\s\S]*Занято занятиями/);
  assert.doesNotMatch(body, /Английский язык|Белова/);
  const _csrf = csrf(body);
  const book = overrides => request(app, '/room-booking', mira, { ...defaultBooking, ...overrides, _csrf });
  assert.equal((await request(app, '/room-booking', mira, defaultBooking)).status, 403);
  for (const room of ['307', '215']) {
    const response = await book({ room });
    assert.equal(response.status, 409);
    assert.match(await response.text(), /В это время аудитория занята/);
  }
  for (const fields of [
    { date: '2026-02-30' }, { room: '20000' }, { start: '07:30' }, { start: '10:05' },
    { end: '13:00' }, { end: '20:30' }, { end: '10:30' }, { purpose: '   ' }, { purpose: 'а'.repeat(121) },
  ]) {
    assert.equal((await book(fields)).status, 422, JSON.stringify(fields));
  }

  const outcome = await book({});
  assert.equal(outcome.status, 303);
  assert.equal((await book({})).headers.get('location'), outcome.headers.get('location'));
  assert.equal((await book({ start: '12:30', end: '13:00' })).status, 303);
  assert.equal((await book({ start: '12:00', end: '13:00' })).status, 409);
  assert.deepEqual(db.prepare('SELECT created_at FROM room_bookings ORDER BY id').all().map(row => row.created_at),
    ['2026-11-23 05:00:00.000', '2026-11-23 05:00:00.000']);

  const booking = modules.get('room-booking');
  assert.equal(booking.isBooked(db, '214', date, '10:00', '10:30'), false);
  assert.equal(booking.isBooked(db, '214', date, '10:00', '11:00'), true);
  assert.equal(booking.isBooked(db, '214', date, '13:00', '14:00'), false);
  assert.equal(booking.isBooked(db, '215', date, '11:00', '12:00'), false);
  assert.equal(booking.isBooked(db, '214', date, '11:00', '11:00'), false);

  now = new Date('2026-11-23T05:01:00Z');
  const elapsed = await book({ start: '08:00', end: '08:30' });
  assert.equal(elapsed.status, 422);
  assert.match(await elapsed.text(), /Это время уже прошло/);
  now = new Date('2026-11-24T05:00:00Z');
  const historical = await page(app, '/room-booking?room=307&date=2026-11-23', mira);
  assert.match(historical, /Выбранная дата прошла[\s\S]*10:40[\s\S]*12:10[\s\S]*Занято занятиями/);
  assert.doesNotMatch(historical, /Забронировать время/);
  assert.equal((await book({})).headers.get('location'), outcome.headers.get('location'));
});

test('свою бронь можно безопасно отменить, чужая видна только как занятый интервал', async t => {
  const { app, db, modules } = fixture(t, 'core,-schedule,+room-booking');
  const [mira, mark] = await Promise.all([login(app, 'mira'), login(app, 'mark')]);
  const path = '/room-booking?room=307';
  const _csrf = csrf(await page(app, path, mira));
  const markToken = csrf(await page(app, path, mark));
  const create = () => request(app, '/room-booking', mira, { ...defaultBooking, room: '307', _csrf });
  const response = await create();
  assert.equal(response.status, 303);
  const location = response.headers.get('location');
  assert.match(await page(app, location.split('#')[0], mira), /Аудитория забронирована\.[\s\S]*Подготовка &lt;проекта&gt;/);
  const foreign = await page(app, `${path}&studentId=1`, mark);
  assert.match(foreign, /10:30[\s\S]*12:30[\s\S]*Занято/);
  assert.doesNotMatch(foreign, /Подготовка|Мира|Отменить бронь|booking-1/);
  const conflict = await request(app, '/room-booking', mark,
    { ...defaultBooking, room: '307', date: '23.11.2026', purpose: 'Своя встреча', _csrf: markToken });
  assert.equal(conflict.status, 409);
  const visibleConflict = await conflict.text();
  assert.match(visibleConflict, /role="alert"[^>]*>В это время аудитория занята/);
  assert.match(visibleConflict, /<option value="10:30" selected>10:30<\/option>/);
  assert.match(visibleConflict, /<option value="12:30" selected>12:30<\/option>/);
  assert.match(visibleConflict, /value="Своя встреча"/);
  const cancelPath = '/room-booking/1/cancel';
  assert.equal((await request(app, cancelPath, mark, { _csrf: markToken })).status, 404);
  assert.equal((await request(app, cancelPath, mira, {})).status, 403);

  const services = modules.get('room-booking');
  const range = { from: date, to: date };
  assert.deepEqual(services.calendarEvents(db, 2, range), []);
  assert.deepEqual(services.calendarEvents(db, 1, range), [{
    id: 'booking:1', kind: 'booking', title: 'Бронь аудитории 307', date,
    start: '10:30', end: '12:30', place: 'Учебный корпус 1 · ауд. 307',
    href: '/room-booking?room=307&date=2026-11-23#booking-1', details: defaultBooking.purpose,
  }]);

  const cancelled = await request(app, cancelPath, mira, { _csrf });
  assert.equal(cancelled.status, 303);
  assert.match(await page(app, cancelled.headers.get('location'), mira), /Бронь отменена/);
  assert.deepEqual(services.calendarEvents(db, 1, range), []);
  assert.equal(services.isBooked(db, '307', date, '10:30', '12:30'), false);
  assert.equal((await create()).status, 303);
  assert.equal((await request(app, cancelPath, mira, { _csrf })).status, 303);
  assert.equal(services.isBooked(db, '307', date, '10:30', '12:30'), true);
});

test('меню меняется по дате и предлагает ближайший день при отсутствии блюд', async t => {
  const { app, db } = fixture(t, 'core,-schedule,+dining');
  const mira = await login(app, 'mira');
  const monday = await page(app, '/dining', mira);
  assert.match(monday, /Столовая учебного корпуса[\s\S]*23 ноября 2026[\s\S]*08:30[\s\S]*18:00[\s\S]*МСК/);
  assert.match(monday, /Супы[\s\S]*Куриный суп с лапшой[\s\S]*135 ₽/);
  assert.match(await page(app, '/dining?date=2026-11-24', mira), /Томатный суп с чечевицей/);
  assert.match(await page(app, '/dining?date=2026-11-25', mira), /Борщ со сметаной/);
  assert.match(await page(app, '/dining?date=2026-11-30', mira), /меню не опубликовано[\s\S]*href="\/dining\?date=2026-11-25"/);
  assert.match(await page(app, '/dining?date=2026-02-30', mira), /Куриный суп с лапшой/);
  seedDemoData(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM dining_menus').get().total, 3);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('статус корпусов вычисляется по часам МСК, выходные относятся к выбранной дате', async t => {
  let now = demoNow();
  const { app } = fixture(t, 'core,-schedule,+buildings', () => now);
  const mira = await login(app, 'mira');
  const monday = await page(app, '/buildings', mira);
  assert.match(monday, /Учебная улица, 12[\s\S]*07:30[\s\S]*21:00[\s\S]*Открыт/);
  assert.match(monday, /Университетский проезд, 4[\s\S]*09:00[\s\S]*19:00[\s\S]*Закрыт/);
  const saturday = await page(app, '/buildings?date=2026-11-28', mira);
  assert.match(saturday, /28 ноября 2026/);
  assert.doesNotMatch(saturday, />Сейчас|>Открыт<|>Закрыт</);
  const saturdayRu = await page(app, '/buildings?date=28.11.2026', mira);
  assert.match(saturdayRu, /id="buildings-date" type="text" name="date" value="28\.11\.2026"/);
  assert.match(saturdayRu, /09:00[\s\S]*16:00[\s\S]*Выходной/);
  assert.match(saturday, /Учебный корпус[\s\S]*09:00[\s\S]*16:00[\s\S]*Языковой корпус[\s\S]*Выходной/);
  const sunday = await page(app, '/buildings?date=2026-11-29', mira);
  assert.equal((sunday.match(/<dd>Выходной<\/dd>/g) ?? []).length, 3);
  now = new Date('2026-11-23T18:00:00Z');
  const evening = await page(app, '/buildings', mira);
  assert.doesNotMatch(evening, /<span[^>]*>Открыт<\/span>/);
  assert.equal((evening.match(/<span class="status-pill">Закрыт<\/span>/g) ?? []).length, 3);
});

test('студент видит свои рейсы в обе стороны, включая отдельные выходные часы', async t => {
  let now = demoNow();
  const { app, db } = fixture(t, 'core,-schedule,+shuttles', () => now);
  assert.deepEqual(db.prepare('SELECT student_id FROM shuttle_dorm_assignments ORDER BY student_id').all()
    .map(row => row.student_id), [2, 1002, 1004, 1006, 1007]);
  const [mark, lev] = await Promise.all([login(app, 'mark'), login(app, 'lev')]);
  const publicView = await page(app, '/shuttles?studentId=2&residence=dubki', lev);
  assert.match(publicView, /Шаттл до общежития 1/);
  assert.match(publicView, /Учебный корпус 1 → Общежитие 1/);
  assert.match(publicView, /Общежитие 1 → Учебный корпус 1/);
  assert.doesNotMatch(publicView, /Дубовозка|Дубки|Одинцово/);
  const weekday = await page(app, '/shuttles', mark);
  assert.match(weekday, /Общежитие «Дубки» → Учебный корпус 1/);
  assert.match(weekday, /Учебный корпус 1 → Общежитие «Дубки»/);
  assert.match(weekday, /Остановки[\s\S]*Станция Одинцово/);
  assert.match(weekday, /Ближайший рейс ·\s*<time datetime="2026-11-23T08:10:00\+03:00">08:10/);
  const weekend = await page(app, '/shuttles?date=2026-11-28', mark);
  assert.match(weekend, /Выходной день[\s\S]*Дубовозка[\s\S]*10:15/);
  assert.doesNotMatch(weekend, /08:10/);
  now = new Date('2026-11-23T18:00:00Z');
  const evening = await page(app, '/shuttles', mark);
  assert.match(evening, /2026-11-24T08:10:00\+03:00">24 ноября 2026 · 08:10/);
});

test('фикстуры шаттлов добавляются в базу с неполным набором демопрофилей', t => {
  const modules = resolveModules('core,-schedule,+shuttles');
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  db.prepare('INSERT INTO students VALUES (?, ?, ?, ?, ?, ?)')
    .run(2, 'Марк Ясный', 'Международная экономика', 'Экономика', 1, 'Э-11');
  applySql(db, new URL('../src/shuttles/seed.sql', import.meta.url));
  assert.deepEqual(db.prepare('SELECT student_id FROM shuttle_dorm_assignments').all()
    .map(row => row.student_id), [2]);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('второй учебный корпус доступен в расписании и для брони, занятость учитывает пары', async t => {
  const { app } = fixture(t, 'core,+buildings,+room-booking');
  const mira = await login(app, 'mira');
  assert.match(await page(app, '/buildings', mira), /Учебный корпус 2/);
  const second = await page(app, '/schedule?date=2026-11-25&building=3', mira);
  assert.match(second, /История региона[\s\S]*ауд\. 118 · Учебный корпус 2/);
  assert.doesNotMatch(second, /Английский язык/);
  assert.match(second, /date=2026-11-26&amp;building=3#day/);
  assert.match(second, /date=2026-11-23&amp;building=3#calendar/);
  const first = await page(app, '/schedule?date=2026-11-23&building=1', mira);
  assert.match(first, /Английский язык[\s\S]*ауд\. 307[\s\S]*Учебный корпус 1/);
  assert.doesNotMatch(first, /История региона/);
  const room = await page(app, '/room-booking?room=118&date=2026-11-25', mira);
  assert.match(room, /aria-label="Корпуса"[\s\S]*Учебный корпус 1[\s\S]*Учебный корпус 2/);
  assert.match(room, /Аудитория 118[\s\S]*Учебный корпус 2[\s\S]*09:00[\s\S]*10:30[\s\S]*Занято занятиями/);
  const book = start => request(app, '/room-booking', mira, {
    ...defaultBooking, room: '118', date: '2026-11-25', start, end: '11:30', _csrf: csrf(room),
  });
  assert.equal((await book('09:30')).status, 409);
  assert.equal((await book('10:30')).status, 303);
});
