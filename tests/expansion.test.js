import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { prepareDemo } from '../demo/dev.js';
import { seedDemoData } from '../demo/seed.js';
import { setupOfficeDemo } from '../demo/staff.js';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { applySql } from '../src/db/sql.js';
import { resolveModules } from '../src/modules/catalog.js';
import { createApp } from '../src/server.js';
import { publishRoom } from '../src/room-publication/publication.js';

const secret = 'local-fixture-secret-for-campus-expansion';
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const csrf = html => {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match);
  return match[1];
};

async function studentSession(app, account) {
  const entry = await app.request('/login');
  const auth = await app.request('/login', {
    method: 'POST',
    headers: { cookie: cookie(entry) },
    body: new URLSearchParams({ ...account, _csrf: csrf(await entry.text()) }),
  });
  assert.equal(auth.status, 303);
  const headers = { cookie: cookie(auth) };
  const request = (path, body) => app.request(path, body
    ? { headers, method: 'POST', body: new URLSearchParams(body) }
    : { headers });
  const read = async path => {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    return response.text();
  };
  return { read, request };
}

test('календарь и сервисы используют разные данные Миры, Марка и Льва', async t => {
  const modules = resolveModules('full');
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  const accounts = await setupDemo(db);
  const app = createApp(db, { secret });
  const [mira, mark, lev] = await Promise.all(['mira', 'mark', 'lev'].map(login =>
    studentSession(app, accounts.find(account => account.login === login))));

  assert.match(await mira.read('/services'), /Студенческий билет[\s\S]*История действий/);
  assert.match(await mira.read('/profile'), /href="\/student-card"/);
  assert.match(await mira.read('/student-card'), /Мира Луговая/);
  assert.doesNotMatch(await mira.read('/student-card?studentId=2'), /Марк Ясный/);
  assert.match(await mira.read('/'), /Срок оплаты/);
  assert.doesNotMatch(await mark.read('/'), /Срок оплаты/);

  const roster = db.prepare('SELECT id FROM students').all();
  assert.equal(roster.length, 15);
  const calendar = modules.get('calendar');
  const range = { from: '2026-11-23', to: '2026-12-02' };
  const timeline = studentId => calendar.eventsForStudent(db, studentId, range);
  assert.deepEqual(roster.filter(({ id }) => timeline(id).some(event => event.kind === 'tuition')).map(({ id }) => id),
    [1, 1001, 1003, 1005, 1011]);
  assert.equal(timeline(1).filter(event => event.kind === 'campus-event').length, 2);
  assert.equal(timeline(2).filter(event => event.kind === 'campus-event').length, 1);
  assert.match(await mira.read('/calendar?date=2026-11-30'), /оплат/i);
  assert.doesNotMatch(await mark.read('/calendar?date=2026-11-30'), /оплат[аы]/i);
  assert.match(await mark.read('/shuttles'), /Дубки/);
  assert.doesNotMatch(await mira.read('/shuttles?studentId=2'), /Дубки/);
  assert.doesNotMatch(await lev.read('/shuttles'), /Дубки/);

  const themePage = await mira.read('/profile');
  assert.equal((await mira.request('/settings/theme', { _csrf: csrf(themePage), theme: 'dark' })).status, 303);
  assert.match(await mira.read('/calendar'), /data-theme="dark"/);
  assert.doesNotMatch(await mark.read('/calendar'), /data-theme="dark"/);
  assert.match(await mira.read('/activity'), /Вход в кабинет/);
  assert.match(await mira.read('/activity'), /тем[аыу]/i);
  assert.doesNotMatch(await mark.read('/activity'), /Выбор темы/i);
  const eventCsrf = csrf(await mira.read('/events/2'));
  assert.equal((await mira.request('/events/2/register', { _csrf: eventCsrf })).status, 303);
  assert.equal((await mira.request('/events/2/cancel', { _csrf: eventCsrf })).status, 303);
  assert.match(await mira.read('/activity'), /Отмена записи на мероприятие[\s\S]*>Запись на мероприятие</);
  assert.doesNotMatch(await mark.read('/activity'), /мероприятие/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('совместимость брони с реальной занятостью пары и отключение расписания', async t => {
  const modules = resolveModules('full');
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  const accounts = await setupDemo(db);
  const app = createApp(db, { secret });
  const [mira, mark] = await Promise.all(accounts.slice(0, 2).map(account => studentSession(app, account)));
  const booking = modules.get('room-booking');
  assert.equal(typeof booking.isBooked, 'function');
  const roomBusy = modules.get('schedule').roomOccupancy(db, '307', '2026-11-23');
  assert.ok(roomBusy.some(slot => slot.starts_at === '10:40'));
  assert.equal(modules.get('schedule').roomOccupancy(db, '214', '2026-11-23').length, 0);
  const [miraBooking, markBooking] = await Promise.all([mira.read('/room-booking'), mark.read('/room-booking')]);
  const form = { room: '214', date: '2026-11-23', start: '10:30', end: '12:30', purpose: 'Подготовка к семинару' };
  const submitted = await Promise.all([
    mira.request('/room-booking', { ...form, _csrf: csrf(miraBooking) }),
    mark.request('/room-booking', { ...form, _csrf: csrf(markBooking) }),
  ]);
  assert.deepEqual(submitted.map(response => response.status).sort(), [303, 409]);
  assert.ok(booking.isBooked(db, '214', '2026-11-23', '10:40', '12:10'));
  const office = await setupOfficeDemo(db);
  const staff = db.prepare('SELECT id FROM staff_accounts WHERE login = ?').get(office.login);
  assert.equal(publishRoom(db, 201, staff.id, '214').outcome, 'booked');
  assert.equal(modules.get('schedule').roomOccupancy(db, '215', '2026-11-23').length, 1);

  const minimal = resolveModules('core,+calendar,+campus-events,+room-booking,-schedule');
  const partial = openDatabase(':memory:', { modules: minimal });
  t.after(() => partial.close());
  seedDemoData(partial);
  const events = minimal.get('calendar').eventsForStudent(partial, 1, { from: '2026-11-23', to: '2026-11-29' });
  assert.equal(events.filter(row => row.kind === 'campus-event').length, 2);
  assert.ok(events.every(row => row.kind !== 'lesson'));
  assert.equal(minimal.has('calendar-export'), false);
  assert.deepEqual(partial.prepare('PRAGMA foreign_key_check').all(), []);
});

test('старое демо получает новые фикстуры без замены паролей и применяет их один раз', async t => {
  const root = mkdtempSync(join(tmpdir(), 'mgimo-demo-expanded-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const baseline = join(root, 'baseline');
  mkdirSync(baseline);
  const previous = openDatabase(join(baseline, 'deanery.sqlite'), { modules: resolveModules('core') });
  const [mira] = await setupDemo(previous);
  const original = previous.prepare("SELECT password_hash FROM accounts WHERE login = 'mira'").get().password_hash;
  previous.close();

  const modules = resolveModules('full');
  const fresh = await prepareDemo(root, { fresh: true, modules });
  assert.deepEqual(fresh.accounts.map(account => account.login), ['program-demo', 'dean-demo', 'rector-demo', 'routing-demo']);
  fresh.activate();
  const db = openDatabase(fresh.filename, { modules });
  assert.deepEqual(db.prepare("SELECT password_hash FROM accounts WHERE login = 'mira'").get().password_hash, original);
  const range = { from: '2026-11-23', to: '2026-12-01' };
  assert.ok(modules.get('calendar').eventsForStudent(db, 1, range).some(row => row.kind === 'tuition'));
  const revisions = () => db.prepare('SELECT COUNT(*) AS count FROM demo_seeded_modules').get().count;
  const initial = revisions();
  assert.ok(initial >= 6);
  const app = createApp(db, { secret });
  assert.match(await (await studentSession(app, mira)).read('/dining'), /Меню/);
  db.close();

  const resumed = await prepareDemo(root, { modules });
  assert.equal(resumed.filename, fresh.filename);
  assert.deepEqual(resumed.accounts.map(account => account.login), []);
  const reopened = openDatabase(resumed.filename, { modules });
  t.after(() => reopened.close());
  assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM demo_seeded_modules').get().count, initial);
  assert.deepEqual(reopened.prepare('PRAGMA foreign_key_check').all(), []);
});

test('новая схема сохраняет дедлайн старого формата и его отметку', async t => {
  const root = mkdtempSync(join(tmpdir(), 'mgimo-demo-deadlines-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const filename = join(root, 'deanery.sqlite');
  const previous = openDatabase(filename, { modules: resolveModules('core') });
  await setupDemo(previous);
  applySql(previous, new URL('../src/deadlines/schema.sql', import.meta.url));
  previous.exec(`
    INSERT INTO deadlines (id, student_id, title, due_date, created_at)
    VALUES (10, 1, 'Старый срок', '2026-11-23', '2026-11-22 05:00:00');
    INSERT INTO deadline_completions VALUES (10, 1, '2026-11-23 05:00:00');
  `);
  previous.close();

  const modules = resolveModules('core,+deadlines');
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = openDatabase(filename, { modules });
    try {
      const deadline = db.prepare('SELECT due_time FROM deadlines WHERE id = 10').get();
      assert.equal(deadline.due_time, null);
      assert.equal(db.prepare('SELECT completed_at FROM deadline_completions WHERE deadline_id = 10').get().completed_at,
        '2026-11-23 05:00:00');
      assert.throws(() => db.exec("UPDATE deadlines SET due_time = '24:00' WHERE id = 10"), /CHECK constraint/);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      db.close();
    }
  }
});
