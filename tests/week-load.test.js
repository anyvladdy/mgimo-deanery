import assert from 'node:assert/strict';
import { test } from 'node:test';
import { weekLoad, weekRange } from '../src/calendar/calendar.js';
import { fixture } from './support/app-fixture.js';

test('сводка считает каждый вид и при равенстве выбирает ранний день', () => {
  const week = weekRange('2026-11-26', '2026-11-23');
  const events = [
    { date: '2026-11-25', kind: 'lesson' }, { date: '2026-11-25', kind: 'deadline' },
    { date: '2026-11-23', kind: 'lesson' }, { date: '2026-11-23', kind: 'exam' },
    { date: '2026-12-01', kind: 'lesson' },
  ];
  const load = weekLoad(events, week);
  assert.deepEqual(load.byKind, new Map([['lesson', 2], ['deadline', 1], ['exam', 1]]));
  assert.equal(load.byDate.size, 7);
  assert.equal(load.total, 4);
  assert.deepEqual(load.busiest, { date: '2026-11-23', count: 2 });
  assert.equal(weekLoad([], week).total, 0);
  assert.equal(weekLoad([], week).busiest, null);
});

test('нагрузка и дедлайны: семь переходов, пустой день и доступные источники', async t => {
  const { login } = fixture(t, { selection: 'full,-campus-events' });
  const mira = await login('mira');
  const week = await mira.page('/calendar');
  assert.match(week, /На неделе/);
  assert.match(week, /Больше всего событий/);
  assert.doesNotMatch(week, /Карьерный митап|>События<\/a>/);
  const deadlines = await mira.page('/deadlines');
  assert.equal((deadlines.match(/href="\/deadlines\?date=/g) ?? []).length, 7);
  assert.match(deadlines, /Сегодня[\s\S]*завтра/);
  assert.match(await mira.page('/deadlines?date=2026-11-25'), /Сдать обзор источников/);
  assert.match(await mira.page('/deadlines?date=2026-11-28'), /На этот день открытых дедлайнов нет/);
});
