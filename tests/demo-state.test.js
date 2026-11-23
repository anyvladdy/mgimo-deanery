import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { prepareDemo } from '../demo/dev.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const secret = 'local-test-secret-for-demo-state';
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const field = (page, name) => page.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];

async function login(app, account, path = '/login') {
  const entry = await app.request(path);
  const response = await app.request(path, {
    method: 'POST', headers: { cookie: cookie(entry) },
    body: new URLSearchParams({ ...account, _csrf: field(await entry.text(), '_csrf') }),
  });
  assert.equal(response.status, 303);
  return cookie(response);
}

test('офис видит обращение после отправки и перезапуска, чистый запуск сохраняет предыдущую базу', async t => {
  const root = mkdtempSync(join(tmpdir(), 'deanery-dev-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const initial = await prepareDemo(root);
  initial.activate();
  const accounts = Object.fromEntries(initial.accounts.map(account => [account.login, account]));
  assert.equal(initial.accounts.length, 21);
  for (const login of ['program-demo', 'dean-demo', 'rector-demo', 'routing-demo']) assert.ok(accounts[login]);

  let db = openDatabase(initial.filename);
  t.after(() => db.close());
  let app = createApp(db, { secret });
  const mira = await login(app, accounts.mira);
  const mark = await login(app, accounts.mark);
  const office = await login(app, accounts['office-demo'], '/office/login');
  const guest = await app.request('/messages');
  assert.equal(guest.status, 303);
  assert.equal(guest.headers.get('location'), '/login');
  assert.doesNotMatch(await guest.text(), /Сообщения|Мира Луговая/);

  const form = await (await app.request('/messages/new', { headers: { cookie: mira } })).text();
  const subject = 'Когда можно забрать справку?';
  const body = 'Хочу забрать справку после занятий.';
  const sent = await app.request('/messages', {
    method: 'POST', headers: { cookie: mira }, body: new URLSearchParams({
      recipient: 'office', subject, body, key: field(form, 'key'), _csrf: field(form, '_csrf'),
    }),
  });
  assert.equal(sent.status, 303);
  const threadPath = sent.headers.get('location');
  const inbox = async () => (await app.request('/office/messages', { headers: { cookie: office } })).text();
  assert.ok((await inbox()).includes(subject));
  assert.equal((await app.request(threadPath, { headers: { cookie: mark } })).status, 404);
  assert.equal(db.prepare('SELECT body FROM thread_messages').get().body, body);

  db.close();
  const resume = await prepareDemo(root);
  assert.equal(resume.filename, initial.filename);
  assert.deepEqual(resume.accounts, []);
  db = openDatabase(resume.filename);
  app = createApp(db, { secret });
  assert.ok((await inbox()).includes(subject));

  const fresh = await prepareDemo(root, { fresh: true });
  assert.notEqual(fresh.filename, initial.filename);
  assert.equal((await prepareDemo(root)).filename, initial.filename);
  fresh.activate();
  assert.equal((await prepareDemo(root)).filename, fresh.filename);
  assert.equal(db.prepare('SELECT body FROM thread_messages').get().body, body);

  db.close();
  db = openDatabase(fresh.filename);
  app = createApp(db, { secret });
  assert.equal((await app.request('/messages', { headers: { cookie: mira } })).headers.get('location'), '/login');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM thread_messages').get().count, 0);
  await login(app, accounts.mira);
  await login(app, accounts['office-demo'], '/office/login');
  const leader = await login(app, accounts['program-demo'], '/office/login');
  assert.equal((await app.request('/office', { headers: { cookie: leader } })).headers.get('location'), '/office/urgent-appeals');
});
