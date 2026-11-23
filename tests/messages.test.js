import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo, setupTeacherDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { passwordRecord } from '../src/account/passwords.js';
import { createApp } from '../src/server.js';

const options = { secret: 'private-local-test-secret-for-messages', secure: true };
const cookie = response => response.headers.get('set-cookie').split(';')[0];

function field(page, name) {
  const value = page.match(new RegExp('name="' + name + '" value="([^"]+)"'))?.[1];
  assert.ok(value, 'форма содержит ' + name);
  return value;
}

async function connect(app, route, account) {
  const start = await app.request(route);
  const login = await app.request(route, {
    method: 'POST',
    headers: { cookie: cookie(start) },
    body: new URLSearchParams({ ...account, _csrf: field(await start.text(), '_csrf') }),
  });
  assert.equal(login.status, 303);
  return browserSession(app, cookie(login));
}

function browserSession(app, jar) {
  const get = path => app.request(path, { headers: { cookie: jar } });
  const post = (path, form) => app.request(path, {
    method: 'POST',
    headers: { cookie: jar },
    body: new URLSearchParams(form),
  });
  return { get, post };
}

function submission(page, fields) {
  return { _csrf: field(page, '_csrf'), key: field(page, 'key'), ...fields };
}

async function reply(session, path, body) {
  const page = await (await session.get(path)).text();
  const form = submission(page, { body });
  const retry = () => session.post(path + '/reply', form);
  const response = await retry();
  const target = response.headers.get('location');
  assert.equal(response.status, 303);
  assert.equal(target?.split('#')[0], path);
  assert.match(target, /#message-\d+$/);
  const next = await retry();
  assert.equal(next.status, 303);
  assert.equal(next.headers.get('location'), target);
  return { target, retry };
}

test('учебный и технический вопросы попадают в очередь офиса, ответы сохраняются в переписке', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'deanery-messages-'));
  const file = join(dir, 'db.sqlite');
  let db = openDatabase(file);
  t.after(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const [mira, mark] = await setupDemo(db);
  const officeAccount = await setupOfficeDemo(db);
  const app = createApp(db, options);
  const student = await connect(app, '/login', mira);
  const other = await connect(app, '/login', mark);
  const office = await connect(app, '/office/login', officeAccount);

  assert.match(await (await student.get('/messages')).text(), /Здесь появятся ваши обращения/);
  const form = await (await student.get('/messages/new')).text();
  assert.match(form, /Учебный офис/);
  assert.match(form, /Технический вопрос · учебный офис/);
  const message = submission(form, { recipient: 'office', subject: 'Зачётные единицы', body: 'Как сверить мой учебный план?' });
  const created = await student.post('/messages', message);
  assert.equal(created.status, 303);
  assert.equal((await student.post('/messages', message)).headers.get('location'), created.headers.get('location'));
  const studentPath = created.headers.get('location');
  const staffPath = '/office' + studentPath;
  const inbox = await (await student.get('/messages')).text();
  const row = inbox.match(/<a class="message-link"[^>]+>[\s\S]+?<\/a>/)?.[0];
  assert.ok(row?.includes(`href="${studentPath}"`));
  assert.match(row, /Зачётные единицы[\s\S]*Ожидается ответ[\s\S]*<time/);
  assert.match(await (await office.get('/office/messages')).text(), /Нужен ответ[\s\S]*Мира Луговая/);
  assert.equal((await other.get(studentPath)).status, 404);
  assert.equal((await other.get(staffPath)).status, 403);

  const sent = await reply(office, staffPath, 'Сверьте план вашей группы в разделе <Учебный план>.');
  const anchor = sent.target.split('#')[1];
  const staffThread = await (await office.get(staffPath)).text();
  assert.match(staffThread, new RegExp(`<li id="${anchor}" tabindex="-1" class="message-bubble is-own"\\s+aria-labelledby="${anchor}-meta" aria-describedby="${anchor}-body">`));
  assert.equal(staffThread.match(new RegExp(`id="${anchor}"`, 'g'))?.length, 1);
  assert.doesNotMatch(staffThread, /id="last-message"/);
  const answered = await (await student.get(studentPath)).text();
  assert.match(answered, /Есть ответ[\s\S]*Анна Борисова/);
  assert.match(answered, /Мира Луговая<\/strong> · Вы[\s\S]*Анна Борисова<\/strong> · Учебный офис/);
  assert.match(answered, /<footer class="site-footer">[\s\S]*Конкурсный прототип/);
  assert.match(answered, /разделе &lt;Учебный план&gt;/);
  assert.equal((answered.match(/Сверьте план/g) ?? []).length, 1);
  assert.equal((await student.post(studentPath + '/reply', { ...submission(answered, { body: 'Спасибо' }), _csrf: '' })).status, 403);
  const invalidReply = await student.post(studentPath + '/reply', submission(answered, { body: '  ' }));
  assert.equal(invalidReply.status, 422);
  assert.match(await invalidReply.text(), /<textarea id="reply-body"[^>]*aria-invalid="true" autofocus[^>]*aria-describedby="reply-error reply-hint"/);
  await reply(student, studentPath, 'Спасибо, нашла свою версию.');
  assert.equal((await sent.retry()).headers.get('location'), sent.target);
  assert.match(await (await office.get('/office/messages')).text(), /Нужен ответ/);
  assert.match(await (await office.get(staffPath)).text(), /Спасибо, нашла свою версию/);
  db.prepare('UPDATE thread_messages SET created_at = ? WHERE body = ?').run('2026-11-20 20:30:00', message.body);
  db.prepare('UPDATE thread_messages SET created_at = ? WHERE thread_id = ? AND body <> ?')
    .run('2026-11-20 22:30:00', Number(studentPath.split('/').at(-1)), message.body);
  const days = await (await student.get(studentPath)).text();
  assert.match(days, /<time datetime="2026-11-20">20 ноября 2026<\/time> · МСК[\s\S]*>23:30<\/time>/);
  assert.match(days, /<time datetime="2026-11-21">21 ноября 2026<\/time> · МСК[\s\S]*<time datetime="2026-11-20T22:30:00.000Z">01:30<\/time>/);
  assert.equal(days.match(/class="message-day-heading"/g)?.length, 2);

  const otherForm = await (await other.get('/messages/new')).text();
  const technical = await other.post('/messages', submission(otherForm,
    { recipient: 'technical', subject: 'Печать расписания', body: 'Браузер не предлагает PDF.' }));
  assert.equal(technical.status, 303);
  const technicalPath = '/office' + technical.headers.get('location');
  assert.match(await (await office.get(technicalPath)).text(), /Марк Ясный · Технический вопрос/);
  await reply(office, technicalPath, 'Выберите «Печать» в меню браузера.');
  assert.match(await (await other.get(technical.headers.get('location'))).text(), /Есть ответ[\s\S]*меню браузера/);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM message_threads').get().total, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM thread_messages').get().total, 5);

  db.close();
  db = openDatabase(file);
  const reopened = createApp(db, options);
  const afterRestart = await connect(reopened, '/login', mira);
  assert.match(await (await afterRestart.get(studentPath)).text(), /Сверьте план[\s\S]*Спасибо, нашла свою версию/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('переписка с преподавателем доступна её участникам, гостевые и чужие действия закрыты', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const officeAccount = await setupOfficeDemo(db);
  const teacherAccount = await setupTeacherDemo(db);
  const teacherId = db.prepare('SELECT id FROM staff_accounts WHERE login = ?').get(teacherAccount.login).id;
  const app = createApp(db, options);
  const student = await connect(app, '/login', mira);
  const other = await connect(app, '/login', mark);
  const office = await connect(app, '/office/login', officeAccount);
  const teacher = await connect(app, '/office/login', teacherAccount);
  const anotherTeacherAccount = { login: 'another-teacher-test', password: randomUUID() };
  const { salt, hash } = await passwordRecord(anotherTeacherAccount.password);
  db.prepare(`
    INSERT INTO staff_accounts (login, full_name, role, salt, password_hash)
    VALUES (?, 'Второй преподаватель', 'teacher', ?, ?)
  `).run(anotherTeacherAccount.login, salt, hash);
  const anotherTeacher = await connect(app, '/office/login', anotherTeacherAccount);
  const form = await (await student.get('/messages/new')).text();
  const otherForm = await (await other.get('/messages/new')).text();
  assert.match(form, /Ирина Голубева · Регионоведение/);
  assert.doesNotMatch(otherForm, /Ирина Голубева/);

  const recipient = 'teacher-' + teacherId;
  const body = 'Можно уточнить, какие источники нужны для семинара?';
  const unauthorized = await other.post('/messages', submission(otherForm, { recipient, subject: 'Семинар', body }));
  assert.equal(unauthorized.status, 422);
  assert.match(await unauthorized.text(), /Выберите преподавателя, назначенного вашей группе/);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM message_threads').get().total, 0);
  const invalid = await student.post('/messages', submission(form, { recipient, subject: 'Тема', body: '  ' }));
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /id="message-body-error"/);
  const sent = await student.post('/messages', submission(form, { recipient, subject: 'Семинар', body }));
  assert.equal(sent.status, 303);
  const studentPath = sent.headers.get('location');
  const teacherPath = '/office' + studentPath;
  const detail = await (await student.get(studentPath)).text();

  const guest = await app.request('/login');
  const guestCsrf = field(await guest.text(), '_csrf');
  const guestSession = browserSession(app, cookie(guest));
  for (const [path, target] of [[studentPath, '/login'], [teacherPath, '/office/login']]) {
    const response = await app.request(path);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), target);
    const write = await guestSession.post(path + '/reply', { _csrf: guestCsrf, body });
    assert.equal(write.headers.get('location'), target);
  }
  assert.equal((await other.get(studentPath)).status, 404);
  assert.equal((await office.get(teacherPath)).status, 404);
  assert.equal((await anotherTeacher.get(teacherPath)).status, 404);
  const officeInbox = await (await office.get('/office/messages')).text();
  assert.doesNotMatch(officeInbox, /Семинар/);
  assert.equal((await office.post(teacherPath + '/reply', {
    _csrf: field(officeInbox, '_csrf'), key: randomUUID(), body: 'Ответ от офиса',
  })).status, 404);
  assert.equal((await other.post(studentPath + '/reply', submission(otherForm, { body }))).status, 404);
  assert.match(await (await teacher.get('/office/messages')).text(), /Семинар[\s\S]*Нужен ответ/);
  await reply(teacher, teacherPath, 'Подойдут два первичных источника.');
  assert.match(await (await student.get(studentPath)).text(), /Есть ответ[\s\S]*Ирина Голубева[\s\S]*два первичных источника/);
  await reply(student, studentPath, 'Есть требования к объёму?');
  await reply(teacher, teacherPath, 'Хватит одной страницы.');
  await reply(student, studentPath, 'Спасибо, понятно.');
  const longThread = await (await student.get(studentPath)).text();
  assert.match(longThread, /href="#reply-body">К форме ответа<\/a>/);
  assert.match(longThread, /<label for="reply-body">Ваш ответ<\/label>[\s\S]*<textarea id="reply-body"/);

  db.prepare('UPDATE staff_accounts SET active = 0 WHERE id = ?').run(teacherId);
  const archived = await (await student.get(studentPath)).text();
  assert.match(archived, /Только просмотр[\s\S]*два первичных источника/);
  assert.doesNotMatch(archived, /Отправить ответ|К форме ответа/);
  assert.equal((await student.post(studentPath + '/reply', submission(detail, { body }))).status, 409);
});
