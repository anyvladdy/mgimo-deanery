import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'local-test-secret-for-two-demo-accounts', secure: true, showProfiles: true };

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

async function login(app, account) {
  const form = await app.request('/login');
  assert.match(form.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(form.headers.get('set-cookie'), /Secure/i);
  const oldCookie = cookie(form);
  const result = await post(app, '/login', oldCookie, { ...account, _csrf: token(await form.text()) });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), '/');
  const signedIn = cookie(result);
  assert.notEqual(signedIn, oldCookie);
  return signedIn;
}

test('два аккаунта, закрытый профиль, срок сессии, ошибка формы и выход', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const app = createApp(db, options);
  const profile = jar => app.request('/profile?studentId=2', { headers: { cookie: jar } });
  const guest = await app.request('/profile');
  assert.equal(guest.headers.get('location'), '/login');
  const form = await app.request('/login');
  const formPage = await form.text();
  assert.match(formPage, /Мира Луговая/);
  assert.match(formPage, /Марк Ясный/);
  assert.match(formPage, /Войти как Мира/);
  assert.doesNotMatch(formPage, /Конкурсный концепт/);
  const guestCookie = cookie(form);
  const csrf = token(formPage);
  const markChoice = await (await app.request('/login?as=mark')).text();
  assert.match(markChoice, /Войти как Марк/);
  assert.match(markChoice, /aria-current="true"/);
  assert.equal((await post(app, '/login', guestCookie, mira)).status, 403);
  const wrong = await post(app, '/login', guestCookie, { ...mira, password: 'ошибка', _csrf: csrf });
  assert.equal(wrong.status, 401);
  assert.match(await wrong.text(), /Проверьте логин и пароль/);
  const a = await login(app, mira);
  const b = await login(app, mark);
  const miraPage = await (await profile(a)).text();
  assert.match(miraPage, /Мира Луговая/);
  assert.doesNotMatch(miraPage, /Марк Ясный/);
  const markPage = await (await profile(b)).text();
  assert.match(markPage, /Марк Ясный/);
  assert.doesNotMatch(markPage, /Мира Луговая/);
  assert.equal((await post(app, '/logout', a, { _csrf: token(markPage) })).status, 403);
  assert.equal((await post(app, '/logout', a, { _csrf: token(miraPage) })).status, 303);
  assert.equal((await profile(a)).headers.get('location'), '/login');
  assert.equal((await profile(b)).status, 200);
  db.prepare('UPDATE sessions SET expires_at = 0 WHERE student_id = ?').run(2);
  assert.equal((await profile(b)).headers.get('location'), '/login');
});

test('повторная подготовка и перезапуск сохраняют доступ, явная смена паролей отзывает сессии', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'deanery-account-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'db.sqlite');
  let db = openDatabase(file);
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const session = await login(createApp(db, options), mira);
  db.close();
  db = openDatabase(file);
  assert.deepEqual(await setupDemo(db), []);
  const app = createApp(db, options);
  const getProfile = () => app.request('/profile', { headers: { cookie: session } });
  assert.equal((await getProfile()).status, 200);
  await login(app, mira);
  const [newAccount] = await setupDemo(db, { rotate: true });
  assert.notEqual(newAccount.password, mira.password);
  assert.equal((await getProfile()).status, 303);
  await login(app, newAccount);
});

test('обычный вход не раскрывает подготовленные профили', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const app = createApp(db, { ...options, showProfiles: false });
  const page = await (await app.request('/login')).text();
  assert.match(page, /Подготовленные профили не включены/);
  assert.doesNotMatch(page, /Мира Луговая/);
  assert.doesNotMatch(page, /Марк Ясный/);
  assert.match(page, /name="login"/);
  assert.match(page, /name="password"/);
});
