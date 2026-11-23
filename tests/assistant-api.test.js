import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { seedDemoData } from '../demo/seed.js';
import { passwordRecord } from '../src/account/passwords.js';
import { openDatabase } from '../src/db/open.js';
import { resolveModules } from '../src/modules/catalog.js';
import { createApp } from '../src/server.js';

const password = 'assistant-test-password';
const { salt, hash } = await passwordRecord(password);
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const csrf = body => /name="_csrf" value="([^"]+)"/.exec(body)?.[1];
const snapshot = () => new Date('2026-11-22T21:00:00Z');
const deadlinePath = '/api/v1/deadlines';
const specPath = '/api/v1/openapi.json';

function fixture(t, selection, now = snapshot) {
  const modules = resolveModules(selection);
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  seedDemoData(db);
  const account = db.prepare('INSERT INTO accounts (student_id, login, salt, password_hash) VALUES (?, ?, ?, ?)');
  account.run(1, 'assistant-mira', salt, hash);
  account.run(2, 'assistant-mark', salt, hash);
  return { db, app: createApp(db, { secret: 'local-assistant-test-session-secret', now }) };
}

async function login(app, student) {
  const entry = await app.request('/login');
  const response = await app.request('/login', {
    method: 'POST',
    headers: { cookie: cookie(entry) },
    body: new URLSearchParams({ login: `assistant-${student}`, password, _csrf: csrf(await entry.text()) }),
  });
  assert.equal(response.status, 303);
  const headers = { cookie: cookie(response) };
  return {
    get: path => app.request(path, { headers }),
    post: (path, body) => app.request(path, { method: 'POST', headers, body: new URLSearchParams(body) }),
  };
}

async function issue(client) {
  const form = await client.get('/integrations');
  assert.equal(form.status, 200);
  const response = await client.post('/integrations/token', { _csrf: csrf(await form.text()), studentId: '2' });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.has('location'), false);
  const body = await response.text();
  const token = /id="assistant-token"[^>]*\breadonly\b[^>]*>([A-Za-z0-9_-]{43})<\/textarea>/.exec(body)?.[1];
  assert.ok(token, 'Токен показан в поле только для чтения');
  assert.ok(body.split(token).length === 2, 'Токен встречается только один раз');
  assert.ok(/Токен действует до <time datetime="[^"]+">[^<]+ МСК<\/time>/.test(body));
  return token;
}

const readApi = (app, token, query = '') => app.request(`${deadlinePath}${query}`, {
  headers: { Authorization: `Bearer ${token}` },
});

async function jsonWithoutToken(response, token) {
  const body = await response.text();
  assert.ok(!body.includes(token), 'API не возвращает токен');
  return JSON.parse(body);
}

test('личный токен показывается один раз, ротируется, истекает и отзывается только владельцем', async t => {
  let schoolNow = snapshot();
  const { app, db } = fixture(t, 'core,+assistant-api', () => schoolNow);
  const unauthenticated = await app.request('/integrations');
  assert.equal(unauthenticated.headers.get('location'), '/login');
  const mira = await login(app, 'mira');
  const mark = await login(app, 'mark');
  assert.equal((await mira.post('/integrations/token', {})).status, 403);
  const neverIssued = await (await mira.get('/integrations?revoked=1')).text();
  assert.match(neverIssued, /Токен ещё не выпущен/);
  assert.doesNotMatch(neverIssued, /Доступ отозван/);

  const before = Date.now();
  const first = await issue(mira);
  const stored = db.prepare('SELECT * FROM assistant_tokens WHERE student_id = 1').get();
  assert.ok(stored.token_hash === createHash('sha256').update(first).digest('hex'), 'SQLite хранит SHA-256');
  assert.ok(Object.values(stored).every(value => value !== first), 'SQLite хранит только хеш токена');
  const lifetime = 30 * 24 * 60 * 60 * 1000;
  assert.ok(stored.expires_at >= before + lifetime && stored.expires_at <= Date.now() + lifetime);
  assert.ok(!(await (await mira.get('/integrations')).text()).includes(first), 'Экран после выпуска не содержит токен');
  assert.ok(!(await (await mark.get('/integrations')).text()).includes(first), 'Другой студент не видит токен');
  assert.equal((await readApi(app, first)).status, 200);

  const other = await issue(mark);
  const replacement = await issue(mira);
  assert.ok(first !== replacement, 'Выпуск заменяет токен новым');
  assert.equal((await readApi(app, first)).status, 401);
  schoolNow = new Date('2035-02-01T12:00:00Z');
  assert.equal((await readApi(app, replacement)).status, 200);
  db.prepare('UPDATE assistant_tokens SET expires_at = ? WHERE student_id = 1').run(Date.now());
  assert.equal((await readApi(app, replacement)).status, 401);
  assert.match(await (await mira.get('/integrations')).text(), /Срок действия токена истёк/);

  const last = await issue(mira);
  const form = await mira.get('/integrations');
  assert.equal((await mira.post('/integrations/revoke', {})).status, 403);
  assert.equal((await readApi(app, last)).status, 200);
  const body = { _csrf: csrf(await form.text()), studentId: '2' };
  for (let index = 0; index < 2; index += 1) {
    const revocation = await mira.post('/integrations/revoke', body);
    assert.equal(revocation.status, 303);
    assert.equal(revocation.headers.get('location'), '/integrations?revoked=1');
  }
  assert.equal((await readApi(app, last)).status, 401);
  assert.equal((await readApi(app, other)).status, 200);
  const revoked = await (await mira.get('/integrations?revoked=1')).text();
  assert.ok(!revoked.includes(last));
  assert.match(revoked, /Доступ отозван/);
  assert.doesNotMatch(revoked, /Токен ещё не выпущен|Срок действия токена истёк/);
  assert.match(await (await mira.get('/integrations')).text(), /Доступ отозван/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM assistant_tokens').get().count, 1);
  await issue(mira);
  const reissued = await (await mira.get('/integrations?revoked=1')).text();
  assert.match(reissued, /Токен действует до/);
  assert.doesNotMatch(reissued, /Доступ отозван/);
});

test('API показывает открытые сроки из календаря в границах учебного дня по МСК', async t => {
  const { app, db } = fixture(t, 'core,+assistant-api,+deadlines,+tuition,+campus-events');
  const deadline = db.prepare('INSERT INTO deadlines (student_id, title, due_date, created_at) VALUES (?, ?, ?, deanery_timestamp())');
  const personal = deadline.run(1, 'Личный срок Миры', '2026-11-23').lastInsertRowid;
  db.prepare('UPDATE deadlines SET due_time = ? WHERE id = ?').run('17:45', personal);
  const completed = deadline.run(1, 'Выполненный срок', '2026-11-24').lastInsertRowid;
  db.prepare('INSERT INTO deadline_completions VALUES (?, 1, deanery_timestamp())').run(completed);
  deadline.run(1, 'Просроченный срок', '2026-11-22');
  deadline.run(1, 'Срок за пределами окна', '2026-12-23');
  deadline.run(2, 'Личный срок Марка', '2026-11-25');

  const mira = await login(app, 'mira');
  const mark = await login(app, 'mark');
  const miraToken = await issue(mira);
  const markToken = await issue(mark);
  const result = await readApi(app, miraToken);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.has('set-cookie'), false);
  const data = await jsonWithoutToken(result, miraToken);
  assert.equal(data.from, '2026-11-23');
  assert.equal(data.to, '2026-12-22');
  assert.deepEqual(data.deadlines.map(item => [item.kind, item.title, item.date]), [
    ['deadline', 'Личный срок Миры', '2026-11-23'],
    ['deadline', 'Сдать обзор источников по истории региона', '2026-11-25'],
    ['tuition', 'Срок оплаты обучения', '2026-11-30'],
  ]);
  assert.equal(data.deadlines[0].time, '17:45');
  assert.ok(data.deadlines.slice(1).every(item => !('time' in item)));
  assert.ok(data.deadlines.every(item => item.href.startsWith('/') && !('student_id' in item)));

  const markOnly = await jsonWithoutToken(await readApi(app, markToken), markToken);
  assert.deepEqual(markOnly.deadlines.map(item => item.title), ['Личный срок Марка']);
  const today = await jsonWithoutToken(await readApi(app, miraToken, '?days=1'), miraToken);
  assert.equal(today.from, today.to);
  assert.deepEqual(today.deadlines.map(item => item.title), ['Личный срок Миры']);
  assert.equal((await readApi(app, miraToken, '?days=90')).status, 200);
  assert.equal((await readApi(app, miraToken, '?studentId=2')).status, 400);
});

test('API требует Bearer, проверяет диапазон и публикует спецификацию только для чтения', async t => {
  const { app } = fixture(t, 'core,+assistant-api');
  const mira = await login(app, 'mira');
  const token = await issue(mira);
  for (const response of [
    await app.request(deadlinePath),
    await mira.get(deadlinePath),
    await app.request(`${deadlinePath}?token=placeholder`),
    await app.request(deadlinePath, { headers: { Authorization: `Basic ${token}` } }),
    await readApi(app, 'A'.repeat(43)),
  ]) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get('www-authenticate'), /^Bearer\b/);
    assert.deepEqual(await jsonWithoutToken(response, token), { error: 'unauthorized' });
  }
  for (const query of ['?days=', '?days=0', '?days=91', '?days=1.0', '?days=-3', '?days=2&days=3']) {
    const response = await readApi(app, token, query);
    assert.equal(response.status, 400);
    assert.deepEqual(await jsonWithoutToken(response, token), { error: 'invalid_days' });
  }
  const empty = await readApi(app, token);
  assert.equal(empty.status, 200);
  assert.deepEqual((await jsonWithoutToken(empty, token)).deadlines, []);

  const specification = await app.request(specPath);
  assert.equal(specification.status, 200);
  const text = await specification.text();
  assert.ok(!text.includes(token), 'OpenAPI не содержит выданный токен');
  const schema = JSON.parse(text);
  assert.equal(schema.openapi, '3.1.0');
  assert.deepEqual(Object.keys(schema.paths), [deadlinePath]);
  assert.deepEqual(Object.keys(schema.paths[deadlinePath]), ['get']);
  const operation = schema.paths[deadlinePath].get;
  assert.equal(operation.operationId, 'listDeadlines');
  assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
  assert.deepEqual(schema.components.securitySchemes.bearerAuth, { type: 'http', scheme: 'bearer' });
  assert.deepEqual(Object.keys(operation.responses), ['200', '400', '401']);
});

test('явно отключённый календарь приостанавливает интеграцию, core не создаёт её таблицы', async t => {
  for (const selection of ['core', 'core,+assistant-api,-calendar']) {
    const { app, db } = fixture(t, selection);
    const mira = await login(app, 'mira');
    assert.equal((await mira.get('/integrations')).status, 404);
    assert.equal((await mira.get(deadlinePath)).status, 404);
    assert.equal((await mira.get(specPath)).status, 404);
    assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'assistant_tokens'").get(), undefined);
  }
});
