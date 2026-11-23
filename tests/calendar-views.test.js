import assert from 'node:assert/strict';
import { test } from 'node:test';
import { datesInRange, monthRange } from '../src/calendar/calendar.js';
import { fixture } from './support/app-fixture.js';

test('месяц календаря включает 42 дня с понедельника, включая 29 февраля', () => {
  const month = monthRange('2028-02-16');
  assert.deepEqual(month, {
    from: '2028-01-31', to: '2028-03-12', first: '2028-02-01', last: '2028-02-29',
    previous: '2028-01-01', next: '2028-03-01',
  });
  const days = datesInRange(month);
  assert.equal(days.length, 42);
  assert.equal(days[1], month.first);
  assert.ok(days.includes('2028-02-29'));
});

test('неделя, месяц и выгрузка календаря используют один слой и сохраняют ссылки на дни', async t => {
  const { login } = fixture(t);
  const mira = await login('mira');
  const filtered = await mira.page('/calendar?kind=deadline');
  assert.match(filtered, /Сдать обзор источников/);
  assert.doesNotMatch(filtered, /Английский язык|Карьерный митап/);
  const combined = await mira.page('/calendar?kind=lesson&kind=deadline,invalid');
  assert.match(combined, /Сдать обзор источников/);
  assert.match(combined, /Английский язык/);
  assert.doesNotMatch(combined, /Карьерный митап/);
  assert.match(await mira.page('/calendar?kind=invalid'), /Карьерный митап/);
  const settings = '/calendar?date=2026-11-25&view=month&kind=deadline';
  for (const mode of ['full', 'lite']) {
    const month = await mira.page(settings, 200, mira.mode(mode));
    assert.equal((month.match(/class="calendar-month-cell/g) ?? []).length, 42);
    assert.match(month, /Ноябрь 2026/);
    assert.match(month, /date=2026-12-01&amp;view=month&amp;kind=deadline/);
    assert.match(month, /date=2026-11-25&amp;kind=deadline#day-2026-11-25/);
    assert.match(month, /aria-current="date"/);
    assert.doesNotMatch(month, /Английский язык|<script/);
  }
  assert.match(await mira.page('/calendar?date=2026-02-30&view=month'), /Ноябрь 2026/);
  assert.match(await mira.page('/calendar?date=2027-04-01&view=month'), /В этом месяце событий нет/);
  const events = await mira.page('/calendar/export.ics?date=2026-11-23&kind=deadline');
  assert.match(events, /UID:deadline-/);
  assert.doesNotMatch(events, /UID:lesson-|UID:campus-event-/);
});
