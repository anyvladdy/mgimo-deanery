import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { openAppDatabase } from '../src/db/open.js';
import { modulesFor } from '../src/modules/config.js';
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

export async function setupOfficeDemo(db) {
  if (!modulesFor(db).has('office')) return null;
  return demoAccount(db, 'office-demo', 'Анна Борисова', 'office');
}

export async function setupTeacherDemo(db) {
  if (!modulesFor(db).has('gradebook')) return null;
  const created = await demoAccount(db, 'teacher-demo', 'Ирина Голубева', 'teacher');
  db.prepare(`
    INSERT INTO teaching_assignments (staff_id, group_code, subject, assessment)
    SELECT a.id, p.group_code, p.subject, p.assessment
    FROM staff_accounts a JOIN plan_group_courses p
    WHERE a.login = 'teacher-demo' AND a.role = 'teacher' AND a.full_name = 'Ирина Голубева'
      AND p.group_code = 'Р-21' AND p.subject = 'Регионоведение' AND p.assessment = 'Экзамен'
    ON CONFLICT DO NOTHING
  `).run();
  modulesFor(db).get('consultations')?.seedDemoConsultations(db);
  modulesFor(db).get('assignments')?.seedDemoAssignments(db);
  return created;
}

const leadershipProfiles = [
  ['program-demo', 'Руководитель программы', 'leadership', 'program'],
  ['dean-demo', 'Декан факультета', 'leadership', 'dean'],
  ['rector-demo', 'Ректор', 'leadership', 'rector'],
  ['routing-demo', 'Администратор маршрутизации', 'admin'],
];

function configureLeadership(db) {
  const modules = modulesFor(db);
  const { setRecipient } = modules.get('urgent-appeals');
  const programs = modules.get('registry').registryOverview(db);
  const scopes = {
    program: programs.map(program => program.name),
    dean: [...new Set(programs.map(program => program.faculty))],
    rector: [''],
  };
  const find = db.prepare("SELECT id FROM staff_accounts WHERE login = ? AND role = 'leadership' AND active = 1");
  for (const [login, , , level] of leadershipProfiles) {
    if (!level) continue;
    const account = find.get(login);
    if (account) for (const scope of scopes[level]) setRecipient(db, level, scope, account.id, { onlyIfEmpty: true });
  }
}

export async function setupLeadershipDemo(db) {
  if (!modulesFor(db).has('urgent-appeals')) return [];
  const accounts = [];
  const find = db.prepare('SELECT 1 FROM staff_accounts WHERE login = ?');
  for (const [login, name, role] of leadershipProfiles) {
    if (!find.get(login)) {
      const created = await demoAccount(db, login, name, role);
      if (created) accounts.push(created);
    }
  }
  configureLeadership(db);
  return accounts;
}

export function copyLeadershipDemo(db, baselineFile) {
  if (!modulesFor(db).has('urgent-appeals')) return;
  const baseline = new DatabaseSync(baselineFile, { readOnly: true });
  try {
    const find = baseline.prepare('SELECT login, full_name, role, salt, password_hash FROM staff_accounts WHERE login = ? AND role = ?');
    const copy = db.prepare(`
      INSERT INTO staff_accounts (login, full_name, role, salt, password_hash)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(login) DO NOTHING
    `);
    for (const [login, , role] of leadershipProfiles) {
      const account = find.get(login, role);
      if (account) copy.run(account.login, account.full_name, account.role, account.salt, account.password_hash);
    }
  } finally {
    baseline.close();
  }
  configureLeadership(db);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openAppDatabase();
  try {
    const accounts = [await setupOfficeDemo(db), await setupTeacherDemo(db), ...await setupLeadershipDemo(db)].filter(Boolean);
    for (const account of accounts) console.log(`${account.login}  ${account.password}`);
    if (!accounts.length) console.log('Учётные записи сотрудников уже подготовлены.');
  } finally {
    db.close();
  }
}
