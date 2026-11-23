import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo, setupTeacherDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const secret = 'local-test-secret-office-student-account';
const cookie = response => response.headers.get('set-cookie').split(';')[0];
function field(page, name) {
  const value = page.match(new RegExp(`name="${name}" value="([^"]+)"`))?.[1];
  assert.ok(value, `Поле ${name} отсутствует`);
  return value;
}

function browser(app, jar) {
  return {
    get: url => app.request(url, { headers: { cookie: jar } }),
    post: (url, fields) => app.request(url, {
      method: 'POST', headers: { cookie: jar }, body: new URLSearchParams(fields),
    }),
  };
}

async function signIn(app, account, path = '/login') {
  const entry = await app.request(path);
  const response = await browser(app, cookie(entry)).post(path, { ...account, _csrf: field(await entry.text(), '_csrf') });
  return { response, client: response.status === 303 ? browser(app, cookie(response)) : undefined };
}

async function scenario(t) {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const officeAccount = await setupOfficeDemo(db);
  const teacherAccount = await setupTeacherDemo(db);
  const app = createApp(db, { secret });
  const { client: office } = await signIn(app, officeAccount, '/office/login');
  const { client: teacher } = await signIn(app, teacherAccount, '/office/login');
  return { db, app, mira, mark, office, teacher };
}

test('студент восстанавливает пароль по коду офиса, повтор кода и прежняя сессия отклоняются', async t => {
  const { db, app, mira, mark, office, teacher } = await scenario(t);
  const oldSession = (await signIn(app, mira)).client;
  const login = await app.request('/login');
  assert.match(await login.text(), /href="\/recover">Забыли пароль\?/);
  const open = await app.request('/recover');
  assert.equal(open.status, 200);
  const guest = browser(app, cookie(open));
  const _csrf = field(await open.text(), '_csrf');
  const submit = login => guest.post('/recover', { login, _csrf });
  const unknown = await submit('unknown-test-nick');
  const requested = await submit(mira.login);
  assert.equal(requested.status, 303);
  assert.equal(unknown.status, requested.status);
  assert.equal(unknown.headers.get('location'), requested.headers.get('location'));
  assert.match(await (await guest.get(requested.headers.get('location'))).text(), /Если логин найден[\s\S]*Ожидайте звонка[\s\S]*обратитесь в учебный офис лично/);
  assert.equal((await guest.post('/recover', { login: mark.login })).status, 403);
  assert.equal((await submit(mira.login)).status, 303);
  const [pending] = db.prepare('SELECT id, status FROM student_password_resets').all();
  assert.equal(pending.status, 'pending');
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM student_password_resets').get().total, 1);
  assert.match(await (await office.get('/office')).text(), /<div class="office-dashboard-queues">[\s\S]*Ожидают рассмотрения · 1[\s\S]*href="\/office\/recovery"[\s\S]*Новые заявки/);

  const queuePath = '/office/recovery';
  const reviewPath = `${queuePath}/${pending.id}`;
  assert.equal((await guest.get(queuePath)).headers.get('location'), '/office/login');
  assert.equal((await oldSession.get(queuePath)).status, 403);
  assert.equal((await teacher.get(queuePath)).status, 403);
  const teacherCsrf = field(await (await teacher.get('/office/gradebook')).text(), '_csrf');
  assert.equal((await teacher.post(reviewPath, { action: 'approve', _csrf: teacherCsrf })).status, 403);
  const queue = await (await office.get(queuePath)).text();
  assert.match(queue, /Мира Луговая[\s\S]*mira/);
  const officeCsrf = field(queue, '_csrf');
  assert.equal((await office.post(reviewPath, { action: 'approve' })).status, 403);
  const approved = await office.post(reviewPath, { action: 'approve', _csrf: officeCsrf });
  assert.equal(approved.status, 200);
  const code = (await approved.text()).match(/<code id="recovery-code">([0-9A-F-]+)<\/code>/)?.[1];
  assert.ok(code);
  assert.equal(db.prepare('SELECT length(code_hash) AS size FROM student_password_resets WHERE id = ?').get(pending.id).size, 32);
  assert.doesNotMatch(await (await office.get(queuePath)).text(), new RegExp(code));
  assert.equal((await office.post(reviewPath, { action: 'approve', _csrf: officeCsrf })).status, 409);
  assert.equal((await submit(mira.login)).status, 303);

  const complete = await guest.get('/recover/complete');
  assert.equal(complete.status, 200);
  const password = 'Фраза для нового пароля';
  const finish = login => guest.post('/recover/complete', { login, code, password, confirmation: password, _csrf });
  const invalidCode = await finish(mark.login);
  assert.equal(invalidCode.status, 422);
  assert.match(await invalidCode.text(), /id="recovery-code"[^>]*aria-describedby="recovery-code-error"[^>]*aria-invalid="true" autofocus/);
  const simultaneous = await Promise.all([finish(mira.login), finish(mira.login)]);
  assert.deepEqual(simultaneous.map(result => result.status).sort(), [303, 422]);
  assert.equal((await finish(mira.login)).status, 422);
  assert.equal((await oldSession.get('/profile')).headers.get('location'), '/login');
  assert.equal((await signIn(app, mira)).response.status, 401);
  assert.equal((await signIn(app, { ...mira, password })).response.status, 303);
  assert.deepEqual({ ...db.prepare('SELECT status, code_hash FROM student_password_resets WHERE id = ?').get(pending.id) },
    { status: 'completed', code_hash: null });
});

test('отклонённый запрос и просроченный код не меняют пароль', async t => {
  const { db, app, mira, office } = await scenario(t);
  const open = await app.request('/recover');
  const guest = browser(app, cookie(open));
  const _csrf = field(await open.text(), '_csrf');
  const request = () => guest.post('/recover', { login: mira.login, _csrf });
  const officeCsrf = field(await (await office.get('/office/recovery')).text(), '_csrf');
  const pending = () => db.prepare("SELECT id FROM student_password_resets WHERE status = 'pending'").get().id;
  const review = (id, action) => office.post(`/office/recovery/${id}`, { action, _csrf: officeCsrf });
  assert.equal((await request()).status, 303);
  const rejected = pending();
  assert.equal((await review(rejected, 'reject')).status, 303);
  assert.equal((await review(rejected, 'approve')).status, 409);
  assert.match(await (await office.get('/office/recovery')).text(), /Отклонён/);
  assert.equal((await request()).status, 303);
  const approved = pending();
  const receipt = await review(approved, 'approve');
  const code = (await receipt.text()).match(/<code id="recovery-code">([0-9A-F-]+)<\/code>/)[1];
  db.prepare('UPDATE student_password_resets SET expires_at = 0 WHERE id = ?').run(approved);
  const password = 'Новый пароль для демо';
  assert.equal((await guest.post('/recover/complete', { login: mira.login, code, password, confirmation: password, _csrf })).status, 422);
  assert.match(await (await office.get('/office/recovery')).text(), /Срок кода истёк/);
  assert.equal((await request()).status, 303);
  assert.notEqual(pending(), approved);
  assert.equal((await signIn(app, mira)).response.status, 303);
});

test('офис меняет ФИО в реестре и профиле, преподавателю и студенту редактор закрыт', async t => {
  const { db, app, mira, office, teacher } = await scenario(t);
  const student = (await signIn(app, mira)).client;
  const previous = db.prepare('SELECT * FROM students WHERE id = 1').get();
  const path = '/office/registry/students/1/name';
  assert.match(await (await office.get('/office/students/1')).text(), /href="\/office\/registry\/students\/1\/name">Изменить ФИО/);
  assert.equal((await app.request(path)).headers.get('location'), '/office/login');
  assert.equal((await student.get(path)).status, 403);
  assert.equal((await teacher.get(path)).status, 403);
  assert.equal((await office.get('/office/registry/students/99999/name')).status, 404);
  const editor = await office.get(path);
  const page = await editor.text();
  assert.equal(editor.status, 200);
  const expected = field(page, 'expected');
  const _csrf = field(page, '_csrf');
  const name = 'Мира Соколова-Луговая';
  const form = { name, expected, _csrf };
  const teacherCsrf = field(await (await teacher.get('/office/gradebook')).text(), '_csrf');
  assert.equal((await teacher.post(path, { ...form, _csrf: teacherCsrf })).status, 403);
  assert.equal((await office.post(path, { ...form, _csrf: '' })).status, 403);
  assert.equal((await office.post(path, { ...form, name: ' ' })).status, 422);
  const saved = await office.post(path, form);
  assert.equal(saved.status, 303);
  assert.match(await (await office.get(saved.headers.get('location'))).text(), /Мира Соколова-Луговая[\s\S]*ФИО обновлено/);
  assert.match(await (await student.get('/profile')).text(), /Мира Соколова-Луговая/);
  assert.match(await (await office.get('/office/students?q=Соколова')).text(), /Мира Соколова-Луговая/);
  assert.equal((await office.post(path, { ...form, name: 'Мира Другова' })).status, 409);
  assert.deepEqual({ ...db.prepare('SELECT * FROM students WHERE id = 1').get() }, { ...previous, full_name: name });
});
