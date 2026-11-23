import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { openAppDatabase } from '../src/db/open.js';
import { passwordRecord } from '../src/account/passwords.js';

async function demoAccount(db, login, name, role) {
  const password = randomBytes(12).toString('base64url');
  const { salt, hash } = await passwordRecord(password);
  const created = db.prepare(`
    INSERT INTO staff_accounts (login, full_name, role, salt, password_hash)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(login) DO NOTHING
  `).run(login, name, role, salt, hash);
  return created.changes ? { login, password } : null;
}

export function setupOfficeDemo(db) {
  return demoAccount(db, 'office-demo', 'Анна Борисова', 'office');
}

export async function setupTeacherDemo(db) {
  const created = await demoAccount(db, 'teacher-demo', 'Ирина Голубева', 'teacher');
  db.prepare(`
    INSERT INTO teaching_assignments (staff_id, group_code, subject, assessment)
    SELECT a.id, p.group_code, p.subject, p.assessment
    FROM staff_accounts a JOIN plan_group_courses p
    WHERE a.login = 'teacher-demo' AND a.role = 'teacher' AND a.full_name = 'Ирина Голубева'
      AND p.group_code = 'Р-21' AND p.subject = 'Регионоведение' AND p.assessment = 'Экзамен'
    ON CONFLICT DO NOTHING
  `).run();
  return created;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openAppDatabase();
  try {
    const accounts = [await setupOfficeDemo(db), await setupTeacherDemo(db)].filter(Boolean);
    for (const account of accounts) console.log(`${account.login}  ${account.password}`);
    if (!accounts.length) console.log('Учётные записи сотрудников уже подготовлены.');
  } finally {
    db.close();
  }
}
