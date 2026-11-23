import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';
import { passwordRecord } from '../src/account/passwords.js';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo, setupTeacherDemo } from '../demo/staff.js';

const secret = 'test-secret-for-student-followthrough';
const cookie = res => res.headers.get('set-cookie').split(';')[0];
const value = (page, field) => page.match(new RegExp(`name="${field}" value="([^"]+)"`))?.[1];

async function signIn(app, path, credentials) {
  const login = await app.request(path);
  const result = await app.request(path, {
    method: 'POST', headers: { cookie: cookie(login) },
    body: new URLSearchParams({ ...credentials, _csrf: value(await login.text(), '_csrf') }),
  });
  assert.equal(result.status, 303);
  const headers = { cookie: cookie(result) };
  const get = url => app.request(url, { headers });
  const read = async url => {
    const response = await get(url);
    assert.equal(response.status, 200, url);
    return response.text();
  };
  const dashboard = await read(path === '/login' ? '/' : '/office/messages');
  const token = value(dashboard, '_csrf');
  assert.ok(token);
  const post = (url, fields) => app.request(url, {
    method: 'POST', headers, body: new URLSearchParams({ _csrf: token, ...fields }),
  });
  return { get, read, post };
}

async function scenario(t) {
  const db = openDatabase();
  t.after(() => db.close());
  const students = await setupDemo(db);
  const staff = await setupOfficeDemo(db);
  const teacher = await setupTeacherDemo(db);
  const app = createApp(db, { secret });
  const accounts = { mira: students[0], mark: students[1], groupmate: students.find(student => student.login === 'lida') };
  return { db, app, accounts, staff, teacher };
}

async function sentBy(student, form, recipient, subject, body) {
  const response = await student.post('/messages', { key: value(form, 'key'), recipient, subject, body });
  assert.equal(response.status, 303);
  return response.headers.get('location');
}

async function reply(person, location, content) {
  const form = await person.read(location);
  const response = await person.post(location + '/reply', { key: value(form, 'key'), body: content });
  assert.equal(response.status, 303);
}

test('обращение из заявки проходит назначение, ответ, уведомление, закрытие и повторное открытие', async t => {
  const { db, app, accounts, staff, teacher } = await scenario(t);
  const student = await signIn(app, '/login', accounts.mira);
  const outsider = await signIn(app, '/login', accounts.mark);
  const office = await signIn(app, '/office/login', staff);
  const instructor = await signIn(app, '/office/login', teacher);

  const anotherAccount = { login: 'second-office-test', password: randomUUID() };
  const { salt, hash } = await passwordRecord(anotherAccount.password);
  db.prepare("INSERT INTO staff_accounts (login, full_name, role, salt, password_hash) VALUES (?, 'Другой сотрудник', 'office', ?, ?)")
    .run(anotherAccount.login, salt, hash);
  const secondOffice = await signIn(app, '/office/login', anotherAccount);

  assert.match(await student.read('/requests/1'), /href="\/messages\/new\?request=1"/);
  assert.equal((await outsider.get('/messages/new?request=1')).status, 404);
  const form = await student.read('/messages/new?request=1');
  assert.match(form, /<option value="office" selected>/);
  assert.equal(value(form, 'subject'), 'Заявка № 1 · Справка об обучении');
  const url = await sentBy(student, form, 'office', value(form, 'subject'), 'Во сколько можно забрать справку?');
  const caseUrl = '/office' + url;

  assert.match(await office.read('/office/messages?view=waiting'), /Заявка № 1/);
  assert.match(await office.read(caseUrl), /Взять в работу/);
  assert.equal((await office.post(caseUrl + '/case', { action: 'close' })).status, 409);
  assert.equal((await instructor.post(caseUrl + '/case', { action: 'assign' })).status, 404);
  assert.equal((await office.post('/office/messages/999/case', { action: 'invalid' })).status, 404);
  assert.equal((await office.post(caseUrl + '/case', { action: 'assign' })).status, 303);
  assert.equal((await secondOffice.post(caseUrl + '/case', { action: 'assign' })).status, 409);
  assert.match(await student.read(url), /Ожидается ответ[\s\S]*Ответственный · Анна Борисова/);

  await reply(office, caseUrl, 'Заберите справку после 14:00.');
  const personal = await student.read('/notices?view=unread');
  assert.match(personal, /Ответ учебного офиса[\s\S]*Заберите справку после 14:00/);
  assert.match(personal, /<li[^>]*class="notice-reply">[\s\S]*Заберите справку после 14:00[\s\S]*Напоминание о сессии/);
  const href = personal.match(/href="(\/messages\/\d+#message-(\d+))"/);
  assert.ok(href);
  assert.equal(href[1].split('#')[0], url);
  const anchored = await student.read(href[1]);
  assert.match(anchored, new RegExp(`<li id="message-${href[2]}" tabindex="-1" class="message-bubble"\\s+aria-labelledby="message-${href[2]}-meta" aria-describedby="message-${href[2]}-body">[\\s\\S]*Заберите справку после 14:00`));
  assert.match(await student.read('/'), /Новые ответы/);
  assert.doesNotMatch(await outsider.read('/notices'), /Заберите справку/);
  assert.equal((await outsider.post('/notices/read', { kind: 'message', event: href[2] })).status, 404);
  assert.equal((await student.post('/notices/read', { kind: 'message', event: href[2], view: 'unread' })).status, 303);
  assert.doesNotMatch(await student.read('/'), /Новые ответы/);
  assert.doesNotMatch(await student.read('/notices?view=unread'), /Заберите справку/);
  assert.match(await student.read('/notices'), /Заберите справку/);
  assert.doesNotMatch(await office.read('/office/messages?view=waiting'), /Заявка № 1/);

  assert.equal((await secondOffice.post(caseUrl + '/case', { action: 'close' })).status, 409);
  assert.equal((await office.post(caseUrl + '/case', { action: 'close' })).status, 303);
  assert.match(await office.read('/office/messages?view=closed'), /Заявка № 1/);
  assert.match(await student.read(url), /Решено[\s\S]*Продолжить обращение/);
  assert.doesNotMatch(await office.read(caseUrl), /Преподаватель сейчас недоступен/);
  assert.equal((await office.post(caseUrl + '/reply', { key: randomUUID(), body: 'Запоздалый ответ' })).status, 409);
  await reply(student, url, 'Офис сегодня закрыт, как получить справку?');
  assert.match(await office.read('/office/messages?view=waiting'), /Заявка № 1/);
  assert.doesNotMatch(await office.read('/office/messages?view=closed'), /Заявка № 1/);
  assert.match(await student.read(url), /Заберите справку[\s\S]*Офис сегодня закрыт/);
});

test('из пары и силлабуса открывается диалог с преподавателем группы, ответ получает только студент', async t => {
  const { db, app, accounts, teacher } = await scenario(t);
  db.prepare('INSERT INTO lessons VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(901, 'Р-21', 'Регионоведение', 'Ирина Голубева', '2026-11-23', '14:00', '15:30', '218');
  const student = await signIn(app, '/login', accounts.mira);
  const outsider = await signIn(app, '/login', accounts.mark);
  const instructor = await signIn(app, '/office/login', teacher);
  const target = 'teacher-' + db.prepare('SELECT id FROM staff_accounts WHERE login = ?').get(teacher.login).id;

  assert.match(await student.read('/schedule'), /href="\/messages\/new\?lesson=901"/);
  assert.doesNotMatch(await student.read('/schedule?view=print'), /Написать преподавателю/);
  assert.match(await student.read('/syllabuses/1'), /href="\/messages\/new\?syllabus=1"/);
  assert.doesNotMatch(await outsider.read('/syllabuses/1'), /Написать преподавателю/);
  for (const path of ['/messages/new?lesson=901', '/messages/new?syllabus=1']) {
    const form = await student.read(path);
    assert.match(form, new RegExp(`<option value="${target}" selected>`));
    assert.equal(value(form, 'subject'), 'Регионоведение');
    assert.equal((await outsider.get(path)).status, 404);
  }

  const form = await student.read('/messages/new?lesson=901');
  const url = await sentBy(student, form, target, value(form, 'subject'), 'Уточните тему семинара');
  await reply(instructor, '/office' + url, 'Прочитайте главу о региональных организациях.');
  assert.match(await student.read('/notices'), /Ответ преподавателя[\s\S]*главу о региональных организациях/);
  assert.doesNotMatch(await outsider.read('/notices'), /главу о региональных организациях/);
});

test('публикация и перенос экзамена видны группе, отметка прочтения привязана к версии', async t => {
  const { db, app, accounts, staff, teacher } = await scenario(t);
  const student = await signIn(app, '/login', accounts.mira);
  const outsider = await signIn(app, '/login', accounts.mark);
  const peer = await signIn(app, '/login', accounts.groupmate);
  const instructor = await signIn(app, '/office/login', teacher);
  const office = await signIn(app, '/office/login', staff);
  const exam = JSON.stringify(['Р-21', 'Регионоведение']);
  const editor = '/office/exams?' + new URLSearchParams({ exam });
  assert.equal((await outsider.get(editor)).status, 403);
  assert.equal((await instructor.get(editor)).status, 403);
  const dashboard = await office.read('/office');
  assert.match(dashboard, /Учебные заявки на рассмотрении/);
  assert.match(dashboard, /href="\/office\/exams"/);
  const examForm = await office.read(editor);
  assert.match(examForm, /ДД\.ММ\.ГГГГ/);
  assert.match(examForm, /Время начала \(МСК\)[\s\S]*value="preview">Проверить перед публикацией/);
  assert.match(await office.read('/office/schedule?date=2026-11-23'), /Занятия на <time[^>]*>23 ноября 2026/);

  const setup = { exam, version: '0', date: '2026-12-15', time: '09:30', building: 'Корпус А', room: '215' };
  assert.equal((await office.post('/office/exams', { ...setup, date: '2026-02-30' })).status, 422);
  const invalid = await office.post('/office/exams', { ...setup, date: '30.02.2026', action: 'preview' });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /id="exam-date"[^>]*value="30.02.2026"[^>]*aria-invalid="true"/);
  const preview = await office.post('/office/exams', { ...setup, action: 'preview', date: '05.12.2026' });
  assert.equal(preview.status, 200);
  const previewPage = await preview.text();
  assert.match(previewPage, /Проверка перед публикацией[\s\S]*Регионоведение · Р-21[\s\S]*5 декабря 2026[\s\S]*09:30<\/time> МСК[\s\S]*value="publish"/);
  assert.equal(value(previewPage, 'date'), '2026-12-05');
  assert.equal(db.prepare('SELECT count(*) AS total FROM exam_slots').get().total, 0);
  const edit = await office.post('/office/exams', { ...setup, action: 'edit', date: '2026-12-05' });
  assert.equal(edit.status, 200);
  assert.match(await edit.text(), /id="exam-date"[^>]*value="05.12.2026"/);
  const finalPreview = await office.post('/office/exams', { ...setup, action: 'preview', date: '15122026' });
  assert.match(await finalPreview.text(), /15 декабря 2026[\s\S]*09:30<\/time> МСК/);
  assert.equal((await office.post('/office/exams', { ...setup, action: 'publish' })).status, 303);
  assert.equal((await office.post('/office/exams', setup)).status, 303);
  assert.equal(db.prepare('SELECT count(*) AS total FROM exam_slots').get().total, 1);
  assert.match(await student.read('/grades?view=pending'), /15 декабря 2026 · 09:30 МСК · Корпус А · ауд. 215/);
  assert.match(await student.read('/'), /09:30 МСК · Корпус А · ауд. 215/);
  assert.match(await student.read('/grades/3/history'), /09:30 МСК · Корпус А · ауд. 215/);
  assert.match(await peer.read('/grades?view=pending'), /09:30 МСК · Корпус А/);
  assert.doesNotMatch(await outsider.read('/grades?view=pending'), /Корпус А/);
  assert.equal((await outsider.post('/notices/read', { kind: 'exam-slot', event: '1' })).status, 404);
  assert.equal((await student.post('/notices/read', { kind: 'exam-slot', event: '1' })).status, 303);
  assert.doesNotMatch(await student.read('/notices?view=unread'), /Корпус А/);
  assert.match(await peer.read('/notices?view=unread'), /Корпус А/);

  const update = { ...setup, time: '11:15', building: 'Корпус Б', room: '310' };
  assert.equal((await office.post('/office/exams', update)).status, 409);
  const version = value(await office.read(editor), 'version');
  assert.equal((await office.post('/office/exams', { ...update, version })).status, 303);
  const feed = await student.read('/notices?view=unread');
  assert.match(feed, /Изменение экзамена[\s\S]*href="\/grades\?view=pending#grade-3"/);
  assert.match(feed, /Было: 15 декабря 2026 · 09:30 МСК · Корпус А · ауд. 215\. Сейчас: 15 декабря 2026 · 11:15 МСК · Корпус Б · ауд. 310/);
  assert.doesNotMatch(await outsider.read('/notices'), /Корпус Б/);
  assert.equal((await student.post('/notices/read', { kind: 'exam-slot', event: version })).status, 404);
  db.prepare("UPDATE grades SET result = '5' WHERE id = 3").run();
  assert.doesNotMatch(await student.read('/notices'), /Изменение экзамена/);
});
