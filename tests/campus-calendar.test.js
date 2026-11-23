import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDemoData } from '../demo/seed.js';
import { passwordRecord } from '../src/account/passwords.js';
import { openDatabase } from '../src/db/open.js';
import { resolveModules } from '../src/modules/catalog.js';
import { bindModules } from '../src/modules/config.js';
import { createApp } from '../src/server.js';

const password = 'fixture-password';
const { salt, hash } = await passwordRecord(password);
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)?.[1];
const week = { from: '2026-11-23', to: '2026-11-29' };

function fixture(t, selection, now) {
  const modules = resolveModules(selection);
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  seedDemoData(db);

  const account = db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)');
  account.run(1, 'calendar-mira', salt, hash);
  account.run(2, 'calendar-mark', salt, hash);
  account.run(1001, 'calendar-lida', salt, hash);
  const app = createApp(db, { secret: 'local-test-secret-for-campus-calendar', now });
  return { app, db, modules };
}

function request(app, path, session, form) {
  return app.request(path, {
    headers: { cookie: session },
    ...(form ? { method: 'POST', body: new URLSearchParams(form) } : {}),
  });
}

async function login(app, user) {
  const entry = await app.request('/login');
  const response = await request(app, '/login', cookie(entry), {
    login: `calendar-${user}`, password, _csrf: csrf(await entry.text()),
  });
  assert.equal(response.status, 303);
  return cookie(response);
}

async function page(app, path, session, expectedStatus = 200) {
  const response = await request(app, path, session);
  assert.equal(response.status, expectedStatus, path);
  return response.text();
}

test('календарь собирает личные источники и сохраняет работу без расписания', async t => {
  const selection = 'core,+calendar,+campus-events,+deadlines,-calendar-export';
  const { app, db, modules } = fixture(t, selection);
  const calendar = modules.get('calendar');
  const miraEvents = calendar.eventsForStudent(db, 1, week);
  assert.ok(miraEvents.some(event => event.kind === 'lesson' && event.place === 'ауд. 307'
    && event.href === '/schedule?date=2026-11-23#lesson-101'));
  assert.ok(miraEvents.some(event => event.kind === 'deadline'));
  assert.ok(miraEvents.some(event => event.kind === 'campus-event' && event.title === 'Карьерный митап'));
  assert.ok(!calendar.eventsForStudent(db, 2, week).some(event => event.kind === 'deadline'
    || event.id === 'lesson-101' || event.title === 'Карьерный митап'));
  assert.deepEqual(calendar.eventsForStudent(db, 1, { from: '2026-11-26', to: '2026-11-26' }),
    miraEvents.filter(event => event.date === '2026-11-26'));
  assert.deepEqual(calendar.eventsForStudent(db, 1, { from: '2026-11-26', to: '2026-11-25' }), []);
  assert.deepEqual(calendar.eventsForStudent(db, 1, { from: '0001-01-01', to: '9999-12-31' }), []);

  const session = await login(app, 'mira');
  const current = await page(app, '/calendar?date=2026-02-30', session);
  assert.match(current, /<h1>Личный календарь<\/h1>/);
  assert.match(current, /href="\/calendar" aria-current="page">Личный календарь<\/a>/);
  assert.match(current, /Ваш план на неделю включает пары, экзамены, мероприятия и дедлайны/);
  assert.match(current, /href="\/schedule\?date=2026-11-23">Только пары группы<\/a>/);
  assert.match(await page(app, '/calendar?date=2026-11-26', session), /href="\/schedule\?date=2026-11-26">Только пары группы/);
  assert.match(current, /Английский язык[\s\S]*ауд\. 307/);
  assert.match(current, /<span class="calendar-event-kind">Занятие<\/span>\s*<span class="notice-meta">ауд\. 307<\/span>/);
  assert.match(current, /date=2026-11-16/);
  assert.match(current, /date=2026-11-30/);
  assert.match(current, /href="\/calendar" aria-current="page">Текущая неделя/);
  assert.equal((current.match(/class="schedule-week-day calendar-day/g) ?? []).length, 7);
  assert.match(current, /id="day-2026-11-24"[\s\S]*?Событий нет/);
  assert.doesNotMatch(current, /export\.ics/);
  await page(app, '/calendar/export.ics', session, 404);
  assert.match(await page(app, '/calendar?date=9999-12-31', session), /23–29 ноября 2026/);
  assert.match(await page(app, '/calendar?date=2026-11-30', session), /На этой неделе событий нет/);
  const exams = await page(app, '/calendar?date=2026-12-15', session);
  assert.match(exams, /\/grades\?view=pending#grade-3[^>]*>Регионоведение/);

  const partial = fixture(t, `${selection},-schedule,-grades`);
  const partialSession = await login(partial.app, 'mira');
  const available = await page(partial.app, '/calendar', partialSession);
  assert.match(available, /Карьерный митап/);
  assert.match(available, /Дедлайн/);
  assert.match(await page(partial.app, '/', partialSession), /href="\/services">Сервисы/);
  assert.doesNotMatch(available, /lesson-101|Английский язык|Только пары группы|включает пары/);
});

test('календарь обнаруживает активный источник по интерфейсу Harness', t => {
  const { db, modules } = fixture(t, 'core,+calendar,-schedule,-grades');
  const provider = {
    calendarEvents: (_, studentId, range) => {
      assert.equal(studentId, 1);
      assert.deepEqual(range, week);
      return [
        { kind: 'campus-event', id: 'provider-2', title: 'Студенческий семинар', date: week.from, href: '//external.example' },
        { kind: 'campus-event', id: 'provider-1', title: 'Круглый стол', date: week.from, href: '/profile' },
      ];
    },
  };
  bindModules(db, {
    entries: () => [...modules.entries(), { id: 'test-provider', services: provider }],
    get: id => id === 'test-provider' ? provider : modules.get(id),
  });
  const events = modules.get('calendar').eventsForStudent(db, 1, week);
  assert.deepEqual(events.map(({ id, href }) => ({ id, href })), [
    { id: 'provider-1', href: '/profile' },
    { id: 'provider-2', href: undefined },
  ]);
});

test('запись на событие идемпотентна и проверяет текущую программу', async t => {
  const { app, db, modules } = fixture(t, 'core,+calendar,+campus-events');
  const [mira, mark] = await Promise.all([login(app, 'mira'), login(app, 'mark')]);
  const catalog = await page(app, '/events', mira);
  const career = catalog.match(/href="(\/events\/\d+)">Карьерный митап/)?.[1];
  assert.ok(career);
  const otherCatalog = await page(app, '/events', mark);
  assert.match(otherCatalog, /День рождения университета/);
  assert.doesNotMatch(otherCatalog, /Карьерный митап/);
  assert.equal((await request(app, career, mark)).status, 404);
  const otherForm = { _csrf: csrf(otherCatalog) };
  assert.equal((await request(app, `${career}/register`, mark, otherForm)).status, 404);
  assert.equal((await request(app, `${career}/cancel`, mark, otherForm)).status, 404);
  assert.equal((await request(app, `${career}/register`, mira, {})).status, 403);

  const form = { _csrf: csrf(catalog) };
  for (let i = 0; i < 2; i++) {
    assert.equal((await request(app, `${career}/register`, mira, form)).status, 303);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM campus_event_registrations').get().count, 1);
  assert.match(await page(app, career, mira), /Участие подтверждено[\s\S]*Отменить запись/);
  const detail = await page(app, career, mira);
  assert.match(detail, /T16:00:00\+03:00">16:00<\/time>–<time datetime="[^"]+T17:30:00\+03:00">17:30<\/time>/);
  assert.match(catalog, /T17:30:00\+03:00">17:30/);
  const cancellation = await request(app, `${career}/cancel`, mira, form);
  assert.equal(cancellation.status, 303);
  assert.match(await page(app, cancellation.headers.get('location'), mira), /role="status">Запись отменена[\s\S]*>Записаться</);
  assert.equal((await request(app, `${career}/cancel`, mira, form)).headers.get('location'), career);
  assert.match(await page(app, career, mira), />Записаться</);

  db.prepare('UPDATE students SET program = ? WHERE id = 1').run('Экономика');
  assert.equal((await request(app, career, mira)).status, 404);
  assert.equal((await request(app, `${career}/register`, mira, form)).status, 404);
  assert.ok(!modules.get('calendar').eventsForStudent(db, 1, week).some(event => event.href === career));
});

test('после начала события нельзя записаться или отменить запись', async t => {
  const afterStart = () => new Date('2026-11-27T14:00:00Z');
  const { app } = fixture(t, 'core,+campus-events', afterStart);
  const mira = await login(app, 'mira');
  const catalog = await page(app, '/events', mira);
  const birthday = catalog.match(/href="(\/events\/\d+)">День рождения университета/)?.[1];
  assert.ok(birthday);
  const form = { _csrf: csrf(catalog) };
  assert.match(await page(app, birthday, mira), /Запись закрыта/);
  assert.equal((await request(app, `${birthday}/register`, mira, form)).status, 409);
  assert.equal((await request(app, `${birthday}/cancel`, mira, form)).status, 409);
});

test('дедлайны проходят валидацию, защищены по владельцу и уходят из календаря после выполнения', async t => {
  const { app, db, modules } = fixture(t, 'core,+calendar,+deadlines');
  const [mira, mark, peer] = await Promise.all([
    login(app, 'mira'), login(app, 'mark'), login(app, 'lida'),
  ]);
  const pageBefore = await page(app, '/deadlines', mira);
  const token = csrf(pageBefore);
  const otherToken = csrf(await page(app, '/deadlines', mark));
  const calendar = modules.get('calendar');
  const groupReminder = calendar.eventsForStudent(db, 1, week).find(event => event.kind === 'deadline');
  const groupId = groupReminder.id.split('-').at(-1);
  assert.ok(calendar.eventsForStudent(db, 1001, week).some(event => event.id === groupReminder.id));
  assert.equal((await request(app, `/deadlines/${groupId}/delete`, mira, { _csrf: token })).status, 404);
  assert.equal((await request(app, `/deadlines/${groupId}/complete`, mira, { _csrf: token })).status, 303);
  assert.ok(!calendar.eventsForStudent(db, 1, week).some(event => event.id === groupReminder.id));
  assert.ok(calendar.eventsForStudent(db, 1001, week).some(event => event.id === groupReminder.id));
  assert.match(await page(app, '/deadlines', peer), new RegExp(groupReminder.title));

  assert.equal((await request(app, '/deadlines', mira, { title: 'Список', date: '2026-02-30' })).status, 403);
  const invalid = await request(app, '/deadlines', mira, { _csrf: token, title: 'Список', date: '2026-02-30' });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /Введите существующую дату/);
  const created = await request(app, '/deadlines', mira, { _csrf: token, title: '<Проверка & план>', date: '26.11.2026' });
  assert.equal(created.status, 303);
  const mine = calendar.eventsForStudent(db, 1, week).find(event => event.title === '<Проверка & план>');
  assert.ok(mine);
  const path = `/deadlines/${mine.id.split('-').at(-1)}`;
  assert.match(await page(app, '/deadlines', mira), /&lt;Проверка &amp; план&gt;/);
  const otherForm = { _csrf: otherToken };
  assert.equal((await request(app, path, mark)).status, 404);
  assert.equal((await request(app, `${path}/complete`, mark, otherForm)).status, 404);
  assert.equal((await request(app, `${path}/delete`, mark, otherForm)).status, 404);
  for (let i = 0; i < 2; i++) {
    assert.equal((await request(app, `${path}/complete`, mira, { _csrf: token })).status, 303);
  }
  assert.ok(!calendar.eventsForStudent(db, 1, week).some(event => event.id === mine.id));
  assert.match(await page(app, '/deadlines', mira), /Выполненные[\s\S]*&lt;Проверка &amp; план&gt;/);
  assert.equal((await request(app, `${path}/delete`, mira, { _csrf: token })).status, 303);
  assert.doesNotMatch(await page(app, '/deadlines', mira), /Проверка/);
});

test('экспорт выбранной недели защищён сессией и формирует календарь со стабильными UID', async t => {
  const { app } = fixture(t, 'core,+calendar-export,+campus-events,+deadlines');
  const path = '/calendar/export.ics?date=2026-11-26';
  const anonymous = await app.request(path);
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get('location'), '/login');
  const mira = await login(app, 'mira');
  assert.match(await page(app, '/calendar?date=2026-11-26', mira), /\/calendar\/export\.ics\?date=2026-11-23/);
  const form = { _csrf: csrf(await page(app, '/deadlines', mira)), date: '2026-11-29',
    title: 'Подготовка\\,; ' + 'согласование'.repeat(8) };
  assert.equal((await request(app, '/deadlines', mira, form)).status, 303);

  const response = await request(app, path, mira);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/calendar\b/);
  assert.match(response.headers.get('content-disposition'), /attachment; filename="deanery-calendar\.ics"/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const raw = await response.text();
  assert.match(raw, /^BEGIN:VCALENDAR\r\n/);
  assert.match(raw, /END:VCALENDAR\r\n$/);
  assert.doesNotMatch(raw.replaceAll('\r\n', ''), /[\r\n�]/);
  assert.ok(raw.split('\r\n').every(line => Buffer.byteLength(line) <= 75));
  assert.match(raw, /\r\n /);
  const unfolded = raw.replaceAll('\r\n ', '');
  assert.match(unfolded, /DTSTART:20261123T074000Z\r\nDTEND:20261123T091000Z/);
  assert.match(unfolded, /DTSTART;VALUE=DATE:20261129/);
  assert.ok(unfolded.includes('SUMMARY:Подготовка\\\\\\,\\; ' + 'согласование'.repeat(8)));
  const repeated = await (await request(app, path, mira)).text();
  assert.deepEqual(repeated.match(/^UID:.*$/gm), raw.match(/^UID:.*$/gm));
  const nextWeek = await (await request(app, '/calendar/export.ics?date=2026-11-30', mira)).text();
  assert.doesNotMatch(nextWeek, /BEGIN:VEVENT/);
});

test('дедлайн проверяет время МСК, определяет просрочку и сохраняет время в экспорте', async t => {
  let now = new Date('2026-11-23T05:00:00Z');
  const { app, db } = fixture(t, 'core,+calendar-export,+deadlines', () => now);
  const mira = await login(app, 'mira');
  const form = { _csrf: csrf(await page(app, '/deadlines', mira)), title: 'Мой срок', date: '23.11.2026' };
  const submit = (time, date = form.date) => request(app, '/deadlines', mira, { ...form, date, time });
  for (const [time, date] of [['24:00'], ['12:60'], ['7:30'], ['07:59'], ['', '22.11.2026']]) {
    assert.equal((await submit(time, date)).status, 422, `${time} ${date ?? form.date}`);
  }
  assert.equal((await submit('08:01')).status, 303);
  assert.equal(db.prepare('SELECT due_time FROM deadlines WHERE title = ?').get(form.title).due_time, '08:01');
  assert.match(await page(app, '/deadlines', mira), /datetime="2026-11-23T08:01:00\+03:00"/);
  assert.match(await page(app, '/calendar', mira), /08:01[\s\S]*Мой срок/);
  assert.match(await page(app, '/calendar/export.ics', mira), /DTSTART:20261123T050100Z/);
  now = new Date('2026-11-23T05:01:00Z');
  assert.match(await page(app, '/deadlines', mira), /Срок истёк[\s\S]*Мой срок/);
  const untimed = await request(app, '/deadlines', mira, { ...form, title: 'До конца дня' });
  assert.equal(untimed.status, 303);
  assert.equal(db.prepare('SELECT due_time FROM deadlines WHERE title = ?').get('До конца дня').due_time, null);
});
