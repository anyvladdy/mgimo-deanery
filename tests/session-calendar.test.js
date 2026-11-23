import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './support/app-fixture.js';

test('календарь сессии открывает месяц первой аттестации и включает свои зачёты и экзамены', async t => {
  const { db, login } = fixture(t);
  db.prepare(`
    UPDATE grades SET result = NULL, exam_date = '2026-12-10' WHERE id = 2
  `).run();
  const [mira, mark] = await Promise.all(['mira', 'mark'].map(login));
  const link = (await mira.page('/grades/session')).match(/href="([^"]+)">Календарь сессии/)[1].replaceAll('&amp;', '&');
  const params = new URL(link, 'http://test').searchParams;
  assert.equal(params.get('date'), '2026-12-10');
  assert.equal(params.get('kind'), 'exam');
  const calendar = await mira.page(link);
  assert.match(calendar, /<h1>Календарь сессии<\/h1>/);
  assert.match(calendar, /Декабрь 2026/);
  assert.match(calendar, /Зачёт: История региона/);
  assert.match(calendar, /Экзамен: Регионоведение/);
  assert.doesNotMatch(calendar, /Экзамен: Экономика|День рождения университета/);
  assert.doesNotMatch(await mark.page(link), /История региона|Регионоведение/);
  assert.match(await mira.page('/calendar?view=week&date=2026-12-10&kind=exam'), /Список аттестаций/);
  assert.match(await mira.page('/calendar/export.ics?date=2026-12-10&kind=exam'), /SUMMARY:История региона/);
});
