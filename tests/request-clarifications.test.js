import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo, setupTeacherDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';

const options = { secret: 'request-clarifications-local-test-secret', secure: true };
const cookie = response => response.headers.get('set-cookie').split(';')[0];
const token = page => page.match(/name="_csrf" value="([^"]+)"/)[1];

function client(app, session, csrf) {
  return {
    get: path => app.request(path, { headers: { cookie: session } }),
    post: (path, values) => app.request(path, {
      method: 'POST', headers: { cookie: session }, body: new URLSearchParams({ _csrf: csrf, ...values }),
    }),
  };
}

async function login(app, account, path = '/login') {
  const form = await app.request(path);
  const guest = client(app, cookie(form), token(await form.text()));
  const response = await guest.post(path, account);
  assert.equal(response.status, 303);
  const session = cookie(response);
  const target = response.headers.get('location');
  const home = await client(app, session).get(target === '/office' ? '/office/gradebook' : '/requests');
  return client(app, session, token(await home.text()));
}

async function lastCycle(staff, path) {
  const page = await staff.get(path);
  return (await page.text()).match(/name="cycle" value="(\d+)"/)[1];
}

async function answerUrl(student, path) {
  const page = await student.get(path);
  return (await page.text()).match(/action="(\/requests\/\d+\/clarifications\/\d+\/answer)"/)[1];
}

test('Личное уточнение справки сохраняется после перезапуска. Повторный вопрос и выдача имеют свои события', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'deanery-clarifications-'));
  const filename = join(directory, 'deanery.sqlite');
  let db = openDatabase(filename);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  const [mira, mark] = await setupDemo(db);
  const staffAccount = await setupOfficeDemo(db);
  const teacherAccount = await setupTeacherDemo(db);
  let app = createApp(db, options);
  let student = await login(app, mira);
  const path = (await student.post('/requests', {})).headers.get('location');
  const staffPath = '/office' + path;

  // The prior schema already stores accepted requests but has no clarification table.
  db.exec('DROP TABLE request_clarifications');
  db.close();
  db = openDatabase(filename);
  app = createApp(db, options);
  student = await login(app, mira);
  let office = await login(app, staffAccount, '/office/login');
  const other = await login(app, mark);
  const teacher = await login(app, teacherAccount, '/office/login');

  const question = '<Кому предназначена справка?>';
  const clarify = { question, cycle: '0' };
  assert.equal((await office.post(staffPath + '/clarify', { ...clarify, _csrf: 'bad' })).status, 403);
  assert.equal((await office.post(staffPath + '/clarify', { ...clarify, question: 'а'.repeat(1001) })).status, 422);
  assert.equal((await office.post(staffPath + '/clarify', clarify)).status, 303);
  assert.equal((await office.post(staffPath + '/clarify', clarify)).status, 409);
  assert.equal((await office.post(staffPath + '/review', { action: 'ready', cycle: '0' })).status, 409);
  const waiting = await (await office.get('/office/requests?view=waiting')).text();
  assert.ok(waiting.includes(`href="${staffPath}"`));
  assert.ok(!(await (await office.get('/office/requests?view=closed')).text()).includes(`href="${staffPath}"`));
  assert.equal((await student.post('/requests', {})).headers.get('location'), path);
  const answer = await answerUrl(student, path);
  const event = answer.split('/').at(-2);
  const today = await (await student.get('/')).text();
  assert.match(today, /next-lesson[\s\S]*От вас требуется/);
  const cta = today.match(/href="([^"]+)">Ответить на вопрос учебного офиса<\/a>/)?.[1];
  assert.equal(cta, path + '#clarification');
  assert.equal(await answerUrl(student, cta.split('#')[0]), answer);
  assert.doesNotMatch(await (await other.get('/')).text(), /От вас требуется/);
  const list = await (await student.get('/requests')).text();
  assert.match(list, /Требуется уточнение/);
  assert.ok(list.includes(`href="${cta}"`));
  assert.ok(list.indexOf(`href="${cta}"`) < list.indexOf('id="new-request"'),
    'ответ на открытый вопрос идёт перед подачей новой заявки');
  assert.match(list, /href="#new-request">Подать заявку<\/a>/);
  assert.match(await (await student.get(path)).text(), /<section id="clarification"[^>]*tabindex="-1"/);
  assert.doesNotMatch(await (await other.get('/requests')).text(), /Требуется уточнение/);
  const unread = await (await student.get('/notices?view=unread')).text();
  assert.match(unread, /Уточнение по заявке/);
  assert.ok(unread.includes(`href="${cta}"`));
  assert.equal((await other.get(path)).status, 404);
  assert.equal((await other.post(answer, { answer: 'Чужой ответ' })).status, 404);
  assert.equal((await other.post('/notices/read', { kind: 'clarification', event })).status, 404);
  assert.equal((await teacher.post(staffPath + '/clarify', clarify)).status, 403);
  assert.equal((await student.post(staffPath + '/clarify', clarify)).status, 403);
  assert.equal((await student.post(answer, { _csrf: 'bad', answer: 'Ответ' })).status, 403);
  assert.equal((await student.post(answer, { answer: '   ' })).status, 422);
  const invalid = await student.post(answer, { answer: '<Черновик>' + 'а'.repeat(1000) });
  assert.equal(invalid.status, 422);
  const invalidPage = await invalid.text();
  const invalidForm = invalidPage.slice(invalidPage.indexOf(`action="${answer}"`));
  assert.match(invalidForm, /id="clarification-error"[\s\S]*<textarea[^>]* aria-invalid="true"/);
  assert.match(invalidForm, /aria-describedby="clarification-error" autofocus>&lt;Черновик&gt;/);
  assert.equal((await student.post('/notices/read', { kind: 'clarification', event })).status, 303);
  assert.doesNotMatch(await (await student.get('/notices?view=unread')).text(), /Уточнение по заявке/);
  assert.match(await (await student.get('/')).text(), /От вас требуется/);

  db.close();
  db = openDatabase(filename);
  app = createApp(db, options);
  student = await login(app, mira);
  office = await login(app, staffAccount, '/office/login');
  assert.equal((await student.post(answer, { answer: '<Для стипендии>' })).status, 303);
  assert.equal((await student.post(answer, { answer: 'Перезапись ответа' })).status, 303);
  const resumed = await (await student.get(path)).text();
  assert.match(resumed, /<p class="request-receipt"><strong>Ответ передан в учебный офис/);
  assert.match(resumed, /&lt;Кому предназначена справка\?&gt;[\s\S]*&lt;Для стипендии&gt;/);
  assert.doesNotMatch(resumed, /Перезапись ответа/);
  assert.doesNotMatch(await (await student.get('/requests')).text(), /#clarification/);
  assert.doesNotMatch(await (await student.get('/')).text(), /От вас требуется/);
  assert.match(await (await office.get(staffPath)).text(), /&lt;Для стипендии&gt;/);
  assert.equal(await lastCycle(office, staffPath), event);
  assert.equal((await office.post(staffPath + '/clarify', { question: 'На каком языке?', cycle: event })).status, 303);
  const second = await answerUrl(student, path);
  assert.notEqual(second, answer);
  assert.match(await (await student.get('/notices?view=unread')).text(), /Уточнение по заявке/);
  const stale = await student.post(answer, { answer: 'Старый ответ' });
  assert.equal(stale.status, 409);
  const stalePage = await stale.text();
  assert.match(stalePage, /role="alert" tabindex="-1" autofocus>Этот вопрос уже закрыт[\s\S]*На каком языке\?/);
  assert.doesNotMatch(stalePage, /aria-invalid="true"|Старый ответ/);
  assert.equal((await student.post(second, { answer: 'На русском' })).status, 303);
  assert.equal((await office.post(staffPath + '/review', { action: 'ready', cycle: event })).status, 409);
  assert.equal((await office.post(staffPath + '/review', { action: 'ready', cycle: await lastCycle(office, staffPath) })).status, 303);
  const ready = await (await student.get(path)).text();
  assert.match(ready, /Справку можно получить в деканате/);
  assert.doesNotMatch(ready, /request-receipt|clarification-answer/);
  assert.match(ready, /Для стипендии[\s\S]*На каком языке\?[\s\S]*На русском/);
  assert.match(await (await student.get('/notices')).text(), /Решение по заявке[\s\S]*Готова/);
});

test('Уточнение переноса сохраняет одну заявку и актуальную проверку права на перенос', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira] = await setupDemo(db);
  const app = createApp(db, options);
  const student = await login(app, mira);
  const office = await login(app, await setupOfficeDemo(db), '/office/login');
  const course = JSON.stringify(['Регионоведение', 'Экзамен']);
  const invalid = await student.post('/requests/postpone', { course: 'нет такой дисциплины' });
  assert.equal(invalid.status, 422);
  const invalidPage = await invalid.text();
  assert.match(invalidPage, /<label for="postpone-course">[^<]+<\/label>\s+<p class="error" id="postpone-error">/);
  assert.match(invalidPage, /<select[^>]* aria-invalid="true" aria-describedby="postpone-error" autofocus>/);
  const path = (await student.post('/requests/postpone', { course })).headers.get('location');
  const staffPath = '/office' + path;
  assert.equal((await office.post(staffPath + '/clarify', { question: ' '.repeat(3), cycle: '0' })).status, 422);
  assert.equal((await office.post(staffPath + '/clarify', { question: 'Уточните причину переноса.', cycle: '0' })).status, 303);
  assert.equal((await student.post('/requests/postpone', { course })).headers.get('location'), path);
  const answer = await answerUrl(student, path);
  assert.equal((await student.post(answer, { answer: 'а'.repeat(1001) })).status, 422);
  assert.equal((await student.post(answer, { answer: 'Не смогу присутствовать.' })).status, 303);
  db.prepare("INSERT INTO grades (student_id, subject, assessment, result) VALUES (1, 'Регионоведение', 'Экзамен', 'Хорошо')").run();
  const cycle = await lastCycle(office, staffPath);
  assert.equal((await office.post(staffPath + '/review', { action: 'approve', cycle })).status, 409);
  assert.equal((await office.post(staffPath + '/review', { action: 'reject', comment: 'Появился результат', cycle })).status, 303);
  assert.match(await (await student.get(path)).text(), /Отклонил|отклонил/);
});
