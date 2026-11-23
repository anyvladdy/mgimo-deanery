import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disciplinePath, fixture } from './support/app-fixture.js';

const region = disciplinePath('Регионоведение');
const english = disciplinePath('Английский язык');

test('карточка доступна из трёх разделов и использует группу, учебный план и назначение преподавателя', async t => {
  const { db, login } = fixture(t);
  const [mira, mark] = await Promise.all([login('mira'), login('mark')]);
  for (const entry of ['/plan', '/grades', '/syllabuses']) assert.ok((await mira.page(entry)).includes(region), entry);
  const card = await mira.page(region);
  assert.match(card, /Ирина Голубева/);
  assert.match(card, /15 декабря 2026/);
  assert.match(card, /messages\/new\?syllabus=1/);
  assert.match(card, /Семинары/);
  assert.match(await mark.page(region, 404), /Дисциплина не найдена в вашем плане/);
  assert.match(await mira.page(english), /ауд\. 307[\s\S]*Было: ауд\. 214[\s\S]*#lesson-101/);
  assert.match(await mira.page(english), /Правила не опубликованы/);
  db.prepare("INSERT INTO grades (student_id, subject, assessment, result) VALUES (1, 'Английский язык', 'Экзамен', '2')").run();
  const debt = await mira.page(english);
  assert.match(debt, />Долг</);
  assert.match(debt, /<ol class="office-records grade-history"[\s\S]*<strong>2<\/strong>[\s\S]*<strong>5<\/strong>/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('несколько видов контроля ведут к оглавлению, а необязательные источники можно отключить', async t => {
  const { db, login } = fixture(t, { selection: 'full,-schedule,-syllabus,-exams,-messages' });
  db.prepare("INSERT INTO plan_group_courses VALUES ('Р-21', 'Регионоведение', 'Зачёт', 3)").run();
  const mira = await login('mira');
  const index = await mira.page(region);
  assert.match(index, /Выберите вид контроля/);
  assert.match(index, />Зачёт</);
  const card = await mira.page(region + '?' + new URLSearchParams({ assessment: 'Экзамен' }));
  assert.match(card, /15 декабря 2026/);
  assert.doesNotMatch(card, /Ближайшее занятие|Правила дисциплины|Написать преподавателю/);
  assert.equal((await mira.get(region + '?assessment=unknown')).status, 404);
});
