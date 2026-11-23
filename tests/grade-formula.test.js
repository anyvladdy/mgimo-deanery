import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disciplinePath, fixture } from './support/app-fixture.js';

test('формула публикуется офисом и считает прогноз и минимальный балл в двух режимах', async t => {
  const { db, login } = fixture(t);
  const [mira, office, teacher] = await Promise.all([login('mira'), login('office'), login('teacher')]);
  const editor = '/office/syllabuses/1/formula';
  const course = disciplinePath('Регионоведение');
  const weights = { current_weight: '60', exam_weight: '40', scale: '10', rounding: 'half_up' };
  assert.match(await mira.page(course), /Формула не опубликована/);
  assert.equal((await mira.get(editor)).status, 403);
  assert.equal((await teacher.post(editor, weights)).status, 403);
  assert.equal((await office.post(editor, { ...weights, _csrf: 'wrong' })).status, 403);
  const invalid = await office.post(editor, { ...weights, exam_weight: '20' });
  assert.equal(invalid.status, 422);
  assert.match(await invalid.text(), /Сумма весов должна быть 100%/);
  assert.equal((await office.post(editor, weights)).status, 303);
  assert.equal((await office.post(editor, weights)).status, 303);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM syllabus_formulas').get().total, 1);
  const result = course + '?current=6%2C3&exam=8&target=5';
  for (const mode of ['lite', 'full']) {
    const page = await mira.page(result, 200, mira.mode(mode));
    assert.doesNotMatch(page, /<script/);
    assert.equal(page.includes('/assets/carbon.css'), mode === 'full');
    assert.match(page, /Прогноз итоговой оценки[\s\S]*?<strong>7<\/strong>/);
    assert.match(page, /Нужный балл за экзамен[\s\S]*?<strong>3,05<\/strong>/);
  }
  assert.match(await mira.page(course + '?current=6.3&target=8'), /Недостижимо при этих весах/);
  assert.match(await mira.page(course + '?exam=5', 422), /aria-invalid="true"/);
  assert.equal((await office.post(editor, { ...weights, rounding: 'none' })).status, 303);
  assert.match(await mira.page(result), /Прогноз итоговой оценки[\s\S]*?<strong>6,98<\/strong>/);
  assert.equal((await office.post(editor, { ...weights, current_weight: '100', exam_weight: '0' })).status, 303);
  assert.doesNotMatch(await mira.page(result), /Калькулятор оценки/);
});
