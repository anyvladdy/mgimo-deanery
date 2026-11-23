import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { resolveModules } from '../src/modules/catalog.js';
import { createApp } from '../src/server.js';

const secret = 'local-test-secret-for-harness-clock';
const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)[1];
const cookie = response => response.headers.get('set-cookie').split(';')[0];

async function login(app, account, path = '/login') {
  const entry = await app.request(path);
  const grant = await app.request(path, {
    method: 'POST',
    headers: { cookie: cookie(entry) },
    body: new URLSearchParams({ ...account, _csrf: csrf(await entry.text()) }),
  });
  assert.equal(grant.status, 303);
  const headers = { cookie: cookie(grant) };
  const read = async url => {
    const response = await app.request(url, { headers });
    assert.equal(response.status, 200, url);
    return response.text();
  };
  const post = async (url, from, form = {}) => app.request(url, {
    method: 'POST', headers,
    body: new URLSearchParams({ ...form, _csrf: csrf(await read(from)) }),
  });
  return { read, post };
}

test('заявка, переписка и уведомление используют то же время МСК, что и «Сегодня»', async t => {
  const modules = resolveModules('core,+messages');
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  const [account] = await setupDemo(db);
  const employee = await setupOfficeDemo(db);
  let instant = new Date('2026-11-22T20:59:00.000Z');
  const app = createApp(db, { secret, now: () => instant });
  const student = await login(app, account);
  const office = await login(app, employee, '/office/login');

  const created = await student.post('/requests', '/requests');
  assert.equal(created.status, 303);
  assert.match(await student.read(created.headers.get('location')), /2026-11-22T20:59:00\.000Z">22 ноября 2026 · 23:59 МСК/);
  assert.match(await student.read('/'), /22 ноября 2026/);

  const thread = await student.post('/messages', '/messages/new', {
    recipient: 'office', subject: 'Проверка времени', body: 'Вопрос перед полуночью.', key: randomUUID(),
  });
  assert.equal(thread.status, 303);
  const studentThread = thread.headers.get('location');
  const officeThread = '/office' + studentThread;
  instant = new Date('2026-11-22T21:01:00.000Z');
  const answer = await office.post(officeThread + '/reply', officeThread, {
    body: 'Ответ после полуночи.', key: randomUUID(),
  });
  assert.equal(answer.status, 303);
  assert.match(await student.read('/'), /23 ноября 2026/);
  const conversation = await student.read(studentThread);
  assert.match(conversation, /22 ноября 2026[\s\S]*23:59[\s\S]*23 ноября 2026[\s\S]*01<\/time>/);
  assert.match(await student.read('/notices'), /2026-11-22T21:01:00\.000Z">23 ноября 2026 · 00:01 МСК/);
  assert.match(await student.read('/messages'), /2026-11-22T21:01:00\.000Z">23 ноября 2026 · 00:01 МСК/);
  assert.equal(db.prepare('SELECT created_at FROM thread_messages WHERE staff_id IS NOT NULL').get().created_at, '2026-11-22 21:01:00.000');

  assert.doesNotMatch(await office.read('/office/messages?view=closed'), /Проверка времени/);
  const closed = await office.post(officeThread + '/case', officeThread, { action: 'close' });
  assert.equal(closed.status, 303);
  assert.match(await office.read('/office/messages?view=closed'), /Проверка времени[\s\S]*Решено/);
});
