import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedDemoData } from '../demo/seed.js';
import { openDatabase } from '../src/db/open.js';
import { resolveModules } from '../src/modules/catalog.js';
import { fixture } from './support/app-fixture.js';

const verificationCode = text => text.match(/href="\/verify\/([A-Za-z\d_-]{12})"/)?.[1];

test('прошлая готовая справка получает постоянный код, открытую проверку без персональных данных и закрытую печать', async t => {
  const { app, db, login } = fixture(t);
  const [mira, mark] = await Promise.all([login('mira'), login('mark')]);
  assert.match(await mira.page('/requests'), /Готова/);
  assert.equal(db.prepare('SELECT verification_code FROM document_requests WHERE id = 1').get().verification_code, null);
  const code = verificationCode(await mira.page('/requests/1'));
  assert.ok(code);
  assert.equal(verificationCode(await mira.page('/requests/1')), code);
  const printed = await mira.page('/requests/1/print');
  assert.equal(verificationCode(printed), code);
  assert.match(printed, /Мира Луговая[\s\S]*Р-21/);
  assert.equal((await mark.get('/requests/1/print')).status, 404);
  assert.equal((await app.request('/requests/1/print')).status, 303);
  const verified = await app.request(`/verify/${code}`);
  assert.equal(verified.status, 200);
  assert.equal(verified.headers.get('referrer-policy'), 'no-referrer');
  const publicPage = await verified.text();
  assert.match(publicPage, /Справка действительна[\s\S]*Дата выдачи/);
  assert.doesNotMatch(publicPage, /Мира Луговая|Р-21|Регионоведение|\/requests\/1|Номер заявки/);
  assert.equal((await app.request('/verify/no-such-code')).status, 404);
  assert.doesNotMatch(await mira.page('/requests'), new RegExp(code));
});

test('офис выдаёт код в транзакции публикации; разные справки получают разные коды', async t => {
  const { db, login } = fixture(t);
  const [mira, office] = await Promise.all([login('mira'), login('office')]);
  const registered = await mira.post('/requests');
  const id = Number(registered.headers.get('location').split('/').at(-1));
  assert.equal((await mira.get(`/requests/${id}/print`)).status, 404);
  assert.equal((await office.post(`/office/requests/${id}/review`, { action: 'ready', comment: 'Учебный офис', cycle: '0' })).status, 303);
  const issued = db.prepare('SELECT verification_code, issued_at FROM document_requests WHERE id = ?').get(id);
  assert.match(issued.verification_code ?? '', /^[A-Za-z\d_-]{12}$/);
  assert.match(issued.issued_at ?? '', /^2026-11-23/);
  assert.notEqual(issued.verification_code, verificationCode(await mira.page('/requests/1')));
});

test('миграция сохраняет заявку в старом файле SQLite и повторно не меняет её колонки', t => {
  const dir = mkdtempSync(join(tmpdir(), 'deanery-certificate-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = join(dir, 'legacy.sqlite');
  const old = openDatabase(filename, { modules: resolveModules('core,-requests') });
  seedDemoData(old);
  old.exec(readFileSync(new URL('../src/requests/schema.sql', import.meta.url), 'utf8'));
  old.prepare("INSERT INTO document_requests VALUES (15, 1, 'Справка об обучении', 'Готова', '2026-11-01 08:00:00')").run();
  old.close();
  for (let pass = 0; pass < 2; pass += 1) {
    const current = openDatabase(filename, { modules: resolveModules('core') });
    try {
      const row = current.prepare('SELECT * FROM document_requests WHERE id = 15').get();
      assert.equal(row.created_at, '2026-11-01 08:00:00');
      assert.equal(row.status, 'Готова');
      assert.equal(row.verification_code, null);
      assert.equal(row.issued_at, null);
      assert.deepEqual(current.prepare('PRAGMA foreign_key_check').all(), []);
    } finally {
      current.close();
    }
  }
});
