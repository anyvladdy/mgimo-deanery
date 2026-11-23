import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openAppDatabase, syncAcademicGroups } from '../src/db/open.js';
import { passwordRecord } from '../src/account/passwords.js';
import { demoProfiles } from '../src/account/demo-profiles.js';

const seed = readFileSync(new URL('./seed.sql', import.meta.url), 'utf8');

export async function setupDemo(db, { rotate = false } = {}) {
  const accountByStudent = db.prepare('SELECT login FROM accounts WHERE student_id = ?');
  const prepared = [];
  for (const student of demoProfiles) {
    if (!rotate && accountByStudent.get(student.id)?.login === student.login) continue;
    const password = randomBytes(12).toString('base64url');
    prepared.push({ ...student, password, ...await passwordRecord(password) });
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const studentById = db.prepare('SELECT full_name FROM students WHERE id = ?');
    for (const student of demoProfiles) {
      const existing = accountByStudent.get(student.id);
      const profile = studentById.get(student.id);
      if (existing ? existing.login !== student.login : profile && profile.full_name !== student.name) {
        throw new Error('Демо-профиль пересекается с существующей учётной записью.');
      }
    }
    db.exec(seed);
    syncAcademicGroups(db);
    const issued = [];
    for (const item of prepared) {
      const existing = accountByStudent.get(item.id);
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
