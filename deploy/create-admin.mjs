import { randomBytes } from 'node:crypto';
import { passwordRecord } from '../src/account/passwords.js';
import { openAppDatabase } from '../src/db/open.js';
import { modulesFor } from '../src/modules/config.js';

const [rawLogin = '', rawName = '', ...extra] = process.argv.slice(2);
const login = rawLogin.trim();
const name = rawName.trim();
const oneLine = value => value && !/[\u0000-\u001f\u007f]/u.test(value);

if (extra.length || !oneLine(login) || login.length > 80 || !oneLine(name) || name.length > 160) {
  console.error('Использование: node deploy/create-admin.mjs <логин> "<имя>"');
  process.exitCode = 1;
} else {
  const db = openAppDatabase();
  try {
    if (!modulesFor(db).has('office')) throw new Error('Подключите модуль учебного офиса.');
    const password = randomBytes(18).toString('base64url');
    const { salt, hash } = await passwordRecord(password);
    const result = db.prepare(`
      INSERT INTO staff_accounts (login, full_name, role, salt, password_hash)
      VALUES (?, ?, 'admin', ?, ?) ON CONFLICT(login) DO NOTHING
    `).run(login, name, salt, hash);
    if (!result.changes) throw new Error('Этот логин уже существует.');
    console.log(`${login}  ${password}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}
