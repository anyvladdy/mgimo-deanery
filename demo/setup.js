import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openAppDatabase } from '../src/db/open.js';
import { passwordRecord } from '../src/account/passwords.js';

const seed = readFileSync(new URL('./seed.sql', import.meta.url), 'utf8');
const students = [
  { id: 1, login: 'mira' },
  { id: 2, login: 'mark' },
];

export async function setupDemo(db, { rotate = false } = {}) {
  const prepared = [];
  for (const student of students) {
    const password = randomBytes(12).toString('base64url');
    prepared.push({ ...student, password, ...await passwordRecord(password) });
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(seed);
    const issued = [];
    for (const item of prepared) {
      const existing = db.prepare('SELECT login FROM accounts WHERE student_id = ?').get(item.id);
      if (existing && existing.login !== item.login) throw new Error('У демо-студента другая учётная запись.');
      if (existing && !rotate) continue;
      db.prepare(`
        INSERT INTO accounts (student_id, login, salt, password_hash) VALUES (?, ?, ?, ?)
        ON CONFLICT(student_id) DO UPDATE SET salt = excluded.salt, password_hash = excluded.password_hash
      `).run(item.id, item.login, item.salt, item.hash);
      db.prepare('DELETE FROM sessions WHERE student_id = ?').run(item.id);
      issued.push({ login: item.login, password: item.password });
    }
    db.exec('COMMIT');
    return issued;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openAppDatabase();
  try {
    const issued = await setupDemo(db, { rotate: process.argv.includes('--rotate-passwords') });
    for (const account of issued) console.log(`${account.login}  ${account.password}`);
    if (!issued.length) console.log('Демо готово. Существующие пароли сохранены.');
  } finally {
    db.close();
  }
}
