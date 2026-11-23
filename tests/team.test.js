import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/team.js', import.meta.url));

test('два процесса делят каталог, обмениваются сообщением и передают путь', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'deanery-journal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { ...process.env, TEAM_JOURNAL: join(dir, 'team.sqlite') };
  const team = async (...args) => (await run(process.execPath, [script, ...args], { env })).stdout;

  const names = ['schedule-1', 'mobile-1'];
  const paths = ['src/schedule', 'src/schedule/week.ejs'];
  const claims = await Promise.allSettled(names.map((name, i) =>
    team('claim', name, 'Экран недели', paths[i])
  ));
  assert.equal(claims.filter(result => result.status === 'fulfilled').length, 1);
  const winner = claims.findIndex(result => result.status === 'fulfilled');
  const loser = 1 - winner;
  assert.match(claims[loser].reason.stderr, /Занято/);
  await assert.rejects(team('claim', names[loser], 'Ещё одна попытка', 'src/home', paths[loser]), /Занято/);
  assert.doesNotMatch(await team('status'), /src\/home/);

  await team('say', names[loser], names[winner], 'Нужен контракт недели');
  assert.match(await team('log', names[winner]), /Нужен контракт недели/);
  assert.doesNotMatch(await team('log', 'third'), /Нужен контракт недели/);
  await team('done', names[winner], 'Контракт передан');
  await team('claim', names[loser], 'Интеграция', paths[loser]);
  assert.match(await team('status'), new RegExp(names[loser]));
  assert.match(await team('log', 'third'), /Контракт передан/);
});
