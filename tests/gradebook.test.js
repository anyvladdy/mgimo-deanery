import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo, setupTeacherDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';
import { createSheet, publishSheet, sheetForStaff, updateSheetRow } from '../src/gradebook/gradebook.js';
import { moveStudent } from '../src/registry/registry.js';

test('преподаватель публикует только свою ведомость, а пересдача дополняет личную историю', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const [mira, mark] = await setupDemo(db);
  const [office, teacher] = [await setupOfficeDemo(db), await setupTeacherDemo(db)];
  const app = createApp(db, { secret: 'private-local-test-secret-for-gradebook' });
  const csrf = html => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
  const cookie = res => res.headers.get('set-cookie').split(';')[0];
  const get = (path, session) => app.request(path, { headers: { cookie: session } });
  const post = (path, session, fields) => app.request(path, {
    method: 'POST', headers: { cookie: session }, body: new URLSearchParams(fields),
  });
  const signIn = async (path, account, start) => {
    const response = await app.request(path);
    const signed = await post(path, cookie(response), { ...account, _csrf: csrf(await response.text()) });
    assert.equal(signed.status, 303);
    const session = cookie(signed);
    const page = await get(start, session);
    assert.equal(page.status, 200);
    return { session, token: csrf(await page.text()) };
  };
  const gradebook = '/office/gradebook';
  const instructor = await signIn('/office/login', teacher, gradebook);
  const manager = await signIn('/office/login', office, gradebook);
  const student = await signIn('/login', mira, '/grades');
  const other = await signIn('/login', mark, '/grades');
  const submit = (path, identity, values = {}) => post(path, identity.session, { _csrf: identity.token, ...values });
  assert.equal((await get('/office/students', instructor.session)).status, 403);
  assert.equal((await get(gradebook, student.session)).status, 403);
  assert.equal((await get('/office', instructor.session)).headers.get('location'), gradebook);

  const foreign = { kind: 'main', course: JSON.stringify(['Э-11', 'Микроэкономика', 'Экзамен']) };
  assert.equal((await submit(gradebook, instructor, foreign)).status, 422);
  const otherSheet = await submit(gradebook, manager, foreign);
  assert.equal(otherSheet.status, 303);
  assert.equal((await get(otherSheet.headers.get('location'), instructor.session)).status, 404);
  const create = kind => submit(gradebook, instructor, {
    kind, course: JSON.stringify(['Р-21', 'Регионоведение', 'Экзамен']),
  });
  const first = await create('main');
  assert.equal(first.status, 303);
  const path = first.headers.get('location');
  const fill = (url, id, result, attendance = 'present') => submit(`${url}/rows/${id}`, instructor, { attendance, result });
  assert.equal((await submit(`${path}/publish`, instructor)).status, 409);
  assert.equal((await fill(path, 1, '2')).status, 303);
  assert.equal((await fill(path, 1001, '5')).status, 303);
  assert.equal((await fill(path, 1002, '', 'absent')).status, 303);
  assert.match(await (await get('/grades?view=pending', student.session)).text(), /Регионоведение/);
  assert.equal((await submit(`${path}/publish`, instructor)).status, 303);
  assert.equal((await submit(`${path}/publish`, instructor)).status, 303);
  assert.equal((await fill(path, 1, '5')).status, 409);
  assert.match(await (await get('/grades?view=debts', student.session)).text(), /Регионоведение/);
  assert.match(await (await get(path, instructor.session)).text(), /[a-f0-9]{64}/);

  const retake = await create('retake');
  assert.equal(retake.status, 303);
  const retakePath = retake.headers.get('location');
  assert.doesNotMatch(await (await get(retakePath, instructor.session)).text(), /Лида Ветрова/);
  assert.equal((await fill(retakePath, 1, '5')).status, 303);
  assert.equal((await fill(retakePath, 1002, '', 'absent')).status, 303);
  assert.equal((await submit(`${retakePath}/publish`, instructor)).status, 303);
  assert.match(await (await get('/grades?view=debts', student.session)).text(), /Задолженностей нет/);
  const entries = await (await get('/grades/3/history', student.session)).text();
  assert.match(entries, /<strong>5<\/strong>[\s\S]*Пересдача[\s\S]*<strong>2<\/strong>[\s\S]*Ведомость/);
  assert.match(await (await get('/notices', student.session)).text(), /Новый результат[\s\S]*Регионоведение/);
  assert.equal((await get('/grades/3/history', other.session)).status, 404);
  const transcript = await (await get('/grades/transcript', student.session)).text();
  assert.match(transcript, /Регионоведение[\s\S]*Экзамен · 6 з\. е\.[\s\S]*<dd>5<\/dd>/);
  assert.doesNotMatch(transcript, /Микроэкономика/);
  assert.equal(db.prepare('SELECT COUNT(*) AS size FROM grade_attempt_details').get().size, 3);
});

test('после перевода основная ведомость включает нового студента перед публикацией', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  await setupOfficeDemo(db);
  const staff = db.prepare("SELECT id, role FROM staff_accounts WHERE role = 'office'").get();
  const { id } = createSheet(db, staff, ['Р-21', 'Регионоведение', 'Экзамен'], 'main');
  const initial = sheetForStaff(db, staff, id).rows;
  for (const row of initial) {
    assert.equal(updateSheetRow(db, staff, id, row.student_id, 'present', '5'), 'ok');
  }

  const mark = db.prepare('SELECT id, group_code FROM students WHERE id = 2').get();
  assert.equal(moveStudent(db, staff.id, mark.id, mark.group_code, 'Р-21'), 'ok');
  assert.equal(publishSheet(db, staff, id), 'roster-updated');
  const draft = sheetForStaff(db, staff, id);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.rows.length, initial.length + 1);
  assert.equal(draft.rows.find(row => row.student_id === mark.id).result, null);
  assert.equal(draft.rows.find(row => row.student_id === 1).result, '5');
  assert.equal(publishSheet(db, staff, id), 'incomplete');
  assert.equal(updateSheetRow(db, staff, id, mark.id, 'present', '4'), 'ok');
  assert.equal(publishSheet(db, staff, id), 'ok');
  assert.equal(sheetForStaff(db, staff, id).rows.find(row => row.student_id === mark.id).result, '4');
  assert.equal(db.prepare(`
    SELECT g.result FROM grades g JOIN grade_attempt_details d ON d.grade_id = g.id
    WHERE d.sheet_id = ? AND g.student_id = ?
  `).get(id, mark.id).result, '4');
});

test('пересдача требует явного долга или опубликованной неявки', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  await setupOfficeDemo(db);
  const staff = db.prepare("SELECT id, role FROM staff_accounts WHERE role = 'office'").get();
  const course = ['Р-21', 'Регионоведение', 'Экзамен'];
  db.prepare(`
    INSERT INTO grades (student_id, subject, assessment, result) VALUES (?, ?, ?, ?)
  `).run(1001, course[1], course[2], 'На проверке');

  // У Миры есть только будущая дата экзамена, у Романа нет строки результата.
  assert.deepEqual(createSheet(db, staff, course, 'retake'), { error: 'empty' });

  db.prepare(`
    INSERT INTO grades (student_id, subject, assessment, result) VALUES (?, ?, ?, ?)
  `).run(1, course[1], course[2], '2');
  const { id } = createSheet(db, staff, course, 'retake');
  assert.deepEqual(sheetForStaff(db, staff, id).rows.map(row => row.student_id), [1]);
});

test('черновик пересдачи исключает ожидающих результата и студентов с погашенным долгом', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  await setupOfficeDemo(db);
  const staff = db.prepare("SELECT id, role FROM staff_accounts WHERE role = 'office'").get();
  const course = ['Р-21', 'Регионоведение', 'Экзамен'];
  const addGrade = db.prepare('INSERT INTO grades (student_id, subject, assessment, result) VALUES (?, ?, ?, ?)');
  addGrade.run(1001, course[1], course[2], '2');
  addGrade.run(1002, course[1], course[2], '2');
  const { id } = createSheet(db, staff, course, 'retake');
  assert.equal(updateSheetRow(db, staff, id, 1001, 'present', '4'), 'ok');
  assert.equal(updateSheetRow(db, staff, id, 1002, 'present', '5'), 'ok');

  // В прежней версии ожидающего студента могли включить и оценить.
  db.prepare(`
    INSERT INTO grade_sheet_rows (sheet_id, student_id, attendance, result) VALUES (?, 1, 'present', '5')
  `).run(id);
  addGrade.run(1001, course[1], course[2], '3');
  assert.deepEqual(sheetForStaff(db, staff, id).rows.filter(row => row.canExclude).map(row => row.student_id), [1, 1001]);
  assert.equal(updateSheetRow(db, staff, id, 1, 'present', '4'), 'ineligible');
  assert.equal(updateSheetRow(db, staff, id, 1001, 'absent', ''), 'ineligible');
  assert.equal(updateSheetRow(db, staff, id, 1002, 'excluded', ''), 'ineligible');
  assert.equal(publishSheet(db, staff, id), 'postponed');
  assert.equal(sheetForStaff(db, staff, id).status, 'draft');

  for (const student of [1, 1001]) {
    assert.equal(updateSheetRow(db, staff, id, student, 'excluded', ''), 'ok');
  }
  assert.equal(publishSheet(db, staff, id), 'ok');
  assert.equal(publishSheet(db, staff, id), 'ok');
  assert.deepEqual(db.prepare(`
    SELECT g.student_id, g.result FROM grades g JOIN grade_attempt_details d ON d.grade_id = g.id
    WHERE d.sheet_id = ?
  `).all(id).map(row => [row.student_id, row.result]), [[1002, '5']]);
});
