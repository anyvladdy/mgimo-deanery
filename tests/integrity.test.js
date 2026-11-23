import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setupDemo } from '../demo/setup.js';
import { setupOfficeDemo } from '../demo/staff.js';
import { openDatabase } from '../src/db/open.js';
import { createApp } from '../src/server.js';
import { changePlanChoice, planForStudent } from '../src/plan/plan.js';
import { moveStudent } from '../src/registry/registry.js';
import { createSheet, updateSheetRow, publishSheet, sheetForStaff } from '../src/gradebook/gradebook.js';
import { createDraft, editCurriculumCourse, curriculumDetails, publishCurriculum } from '../src/curriculum/curriculum.js';
import { createCertificateRequest } from '../src/requests/requests.js';
import { subjectsWithoutSyllabus, saveSyllabus } from '../src/syllabus/syllabuses.js';
import { gradesForStudent, latestGrades } from '../src/grades/grades.js';

async function officeStaff(db) {
  await setupOfficeDemo(db);
  const row = db.prepare("SELECT id FROM staff_accounts WHERE login = 'office-demo'").get();
  return { id: row.id, role: 'office' };
}

function issueMainSheet(db, staff, results) {
  const sheet = createSheet(db, staff, ['Р-21', 'Регионоведение', 'Экзамен'], 'main');
  assert.ok(sheet.id);
  for (const [studentId, attendance, result] of results) {
    assert.equal(updateSheetRow(db, staff, sheet.id, studentId, attendance, result), 'ok');
  }
  assert.equal(publishSheet(db, staff, sheet.id), 'ok');
  return sheet.id;
}

test('перевод освобождает выбор курса чужой группы и сохраняет историю', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const staff = await officeStaff(db);
  assert.equal(changePlanChoice(db, 1, 11, 111), 'ok');
  const before = planForStudent(db, 1).blocks.find(block => block.id === 11);
  assert.equal(before.options.find(option => option.id === 111).seats_left, 1);

  assert.equal(moveStudent(db, staff.id, 1, 'Р-21', 'Э-11'), 'ok');
  assert.equal(
    db.prepare('SELECT COUNT(*) AS total FROM plan_choices WHERE student_id = 1 AND block_id = 11').get().total,
    0,
    'выбор блока, которого нет у новой группы, удалён',
  );
  const history = db.prepare(`
    SELECT previous_option, next_option FROM plan_choice_history
    WHERE student_id = 1 AND block_id = 11 ORDER BY id DESC LIMIT 1
  `).get();
  assert.deepEqual({ ...history }, { previous_option: 111, next_option: null });
  const freed = planForStudent(db, 1001).blocks.find(block => block.id === 11);
  assert.equal(freed.options.find(option => option.id === 111).seats_left, 2, 'место снова свободно');
});

test('пересдача после перевода закрывает долг по прежней группе', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const staff = await officeStaff(db);
  issueMainSheet(db, staff, [[1, 'present', '2'], [1001, 'present', '5'], [1002, 'absent', '']]);
  assert.equal(moveStudent(db, staff.id, 1, 'Р-21', 'Э-11'), 'ok');

  const retake = createSheet(db, staff, ['Р-21', 'Регионоведение', 'Экзамен'], 'retake');
  assert.ok(retake.id, 'пересдача по прежней дисциплине доступна');
  const sheet = sheetForStaff(db, staff, retake.id);
  assert.deepEqual(sheet.rows.map(row => row.student_id), [1, 1002], 'в состав входит переведённая студентка');
  assert.equal(sheet.rows.find(row => row.student_id === 1).canExclude, false);

  assert.equal(updateSheetRow(db, staff, retake.id, 1, 'present', '5'), 'ok');
  assert.equal(updateSheetRow(db, staff, retake.id, 1002, 'absent', ''), 'ok');
  assert.equal(publishSheet(db, staff, retake.id), 'ok');
  const latest = latestGrades(gradesForStudent(db, 1)).find(row => row.subject === 'Регионоведение');
  assert.equal(latest.result, '5');
});

test('пересдача находит долг переведённого студента без основной ведомости', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const staff = await officeStaff(db);
  assert.equal(db.prepare("SELECT result FROM grades WHERE student_id = 2 AND subject = 'Экономическая статистика'").get().result, 'Не зачтено');
  assert.equal(moveStudent(db, staff.id, 2, 'Э-11', 'Р-21'), 'ok');
  const retake = createSheet(db, staff, ['Э-11', 'Экономическая статистика', 'Зачёт'], 'retake');
  assert.ok(retake.id, 'должник по сохранённой дисциплине остаётся в пересдаче');
  assert.deepEqual(sheetForStaff(db, staff, retake.id).rows.map(row => row.student_id), [2]);
  assert.equal(updateSheetRow(db, staff, retake.id, 2, 'present', 'Зачтено'), 'ok');
  assert.equal(publishSheet(db, staff, retake.id), 'ok');
  const latest = latestGrades(gradesForStudent(db, 2)).find(row => row.subject === 'Экономическая статистика');
  assert.equal(latest.result, 'Зачтено');
});

test('дисциплину с долгом нельзя убрать из плана до пересдачи', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const staff = await officeStaff(db);
  issueMainSheet(db, staff, [[1, 'present', '2'], [1001, 'present', '5'], [1002, 'absent', '']]);

  const draft = createDraft(db, 'Р-21', staff.id);
  assert.ok(draft);
  assert.equal(editCurriculumCourse(db, draft, { subject: 'Регионоведение', assessment: 'Экзамен', credits: 6 }, true), 'ok');
  let details = curriculumDetails(db, draft);
  assert.equal(publishCurriculum(db, draft, details.revision, staff.id), 'debt');

  const retake = createSheet(db, staff, ['Р-21', 'Регионоведение', 'Экзамен'], 'retake');
  assert.ok(retake.id);
  assert.equal(updateSheetRow(db, staff, retake.id, 1, 'present', '5'), 'ok');
  assert.equal(updateSheetRow(db, staff, retake.id, 1002, 'absent', ''), 'ok');
  assert.equal(publishSheet(db, staff, retake.id), 'ok');

  details = curriculumDetails(db, draft);
  assert.equal(publishCurriculum(db, draft, details.revision, staff.id), 'ok');
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS total FROM current_plan_courses
    WHERE group_code = 'Р-21' AND subject = 'Регионоведение'
  `).get().total, 0);
});

test('незачёт по зачёту тоже блокирует удаление дисциплины', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const staff = await officeStaff(db);
  db.prepare("UPDATE grades SET result = 'Не зачтено' WHERE student_id = 1 AND subject = 'История региона'").run();
  const draft = createDraft(db, 'Р-21', staff.id);
  assert.equal(editCurriculumCourse(db, draft, { subject: 'История региона', assessment: 'Зачёт', credits: 4 }, true), 'ok');
  const details = curriculumDetails(db, draft);
  assert.equal(publishCurriculum(db, draft, details.revision, staff.id), 'debt');
});

test('долг переведённого студента тоже защищает дисциплину от удаления', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const staff = await officeStaff(db);
  db.prepare("UPDATE grades SET result = '2' WHERE student_id = 1 AND subject = 'Регионоведение'").run();
  assert.equal(moveStudent(db, staff.id, 1, 'Р-21', 'Э-11'), 'ok');
  const draft = createDraft(db, 'Р-21', staff.id);
  assert.equal(editCurriculumCourse(db, draft, { subject: 'Регионоведение', assessment: 'Экзамен', credits: 6 }, true), 'ok');
  const details = curriculumDetails(db, draft);
  assert.equal(publishCurriculum(db, draft, details.revision, staff.id), 'debt');
});

test('повторная справка открывает уже созданную заявку', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const first = createCertificateRequest(db, 1);
  const second = createCertificateRequest(db, 1);
  assert.equal(second, first);
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS total FROM document_requests
    WHERE student_id = 1 AND kind = 'Справка об обучении' AND status = 'Принята'
  `).get().total, 1);
});

test('силлабусы следуют действующему плану, а не истории', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  await setupDemo(db);
  const staff = await officeStaff(db);
  assert.ok(subjectsWithoutSyllabus(db).includes('История региона'));

  const draft = createDraft(db, 'Р-21', staff.id);
  assert.equal(editCurriculumCourse(db, draft, { subject: 'История региона', assessment: 'Зачёт', credits: 4 }, true), 'ok');
  const details = curriculumDetails(db, draft);
  assert.equal(publishCurriculum(db, draft, details.revision, staff.id), 'ok');
  assert.ok(!subjectsWithoutSyllabus(db).includes('История региона'));
  assert.equal(saveSyllabus(db, null, {
    subject: 'История региона', summary: 'Текст', requirements: 'Текст', assessment: 'Текст', literature: 'Текст',
  }), null);
});

test('некорректный multipart возвращает 400, CSS получает общие заголовки', async t => {
  const db = openDatabase();
  t.after(() => db.close());
  const app = createApp(db, { secret: 'integrity-test-secret-with-32-bytes' });
  const malformed = await app.request('/login', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data' },
    body: 'x',
  });
  assert.equal(malformed.status, 400);
  assert.match(await malformed.text(), /Форма не прочитана/);

  const login = await app.request('/login');
  const page = await login.text();
  const csrf = page.match(/name="_csrf" value="([^"]+)"/)[1];
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const sameLength = await app.request('/login', {
    method: 'POST',
    headers: { cookie },
    body: new URLSearchParams({ _csrf: 'я'.repeat(csrf.length), login: 'mira', password: 'x' }),
  });
  assert.equal(sameLength.status, 403, 'несовпадающий по байтам токен не роняет запрос');

  const css = await app.request('/assets/site.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(css.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(css.headers.get('referrer-policy'), 'same-origin');

  const secureApp = createApp(db, { secret: 'integrity-test-secret-with-32-bytes', secure: true });
  const secureCss = await secureApp.request('/assets/site.css');
  assert.equal(secureCss.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
});
