import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './support/app-fixture.js';

test('сессия показывает ближайшую аттестацию, дату, перенос и задолженность нужного студента', async t => {
  const { db, login } = fixture(t);
  db.prepare("INSERT INTO grades (student_id, subject, assessment, result) VALUES (1, 'Регионоведение', 'Зачёт', 'Не зачтено')").run();
  const slot = db.prepare("INSERT INTO exam_slots (group_code, subject, exam_date, starts_at, building, room, staff_id, published_at) VALUES ('Р-21', 'Регионоведение', ?, '12:00', 'Учебный корпус', ?, 1, deanery_timestamp())");
  slot.run('2026-11-24', '201');
  const version = slot.run('2026-11-25', '214').lastInsertRowid;
  const [mira, mark] = await Promise.all([login('mira'), login('mark')]);
  const page = await mira.page('/grades/session');
  assert.match(page, /Регионоведение[\s\S]*Через 2 дня[\s\S]*214[\s\S]*Было:[\s\S]*201/);
  assert.match(page, /Есть задолженность по дисциплине/);
  assert.match(page, /class="status-pill is-new">Новое/);
  assert.match(page, new RegExp(`/notices#notice-exam-slot-${version}`));
  assert.doesNotMatch(await mark.page('/grades/session'), /Регионоведение|214/);
  assert.match(await mira.page('/'), /href="\/grades\/session"/);
  assert.match(await mira.page('/grades'), /Режим сессии/);
});

test('сессия работает без издателя экзаменов и при пустом расписании сдач', async t => {
  const { db, login } = fixture(t, { selection: 'core' });
  const mira = await login('mira');
  assert.match(await mira.page('/grades/session'), /15 декабря 2026/);
  db.prepare('DELETE FROM grades WHERE student_id = ? AND exam_date IS NOT NULL').run(1);
  assert.match(await mira.page('/grades/session'), /В ближайшее время экзаменов и зачётов нет/);
});
