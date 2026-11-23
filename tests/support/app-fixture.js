import assert from 'node:assert/strict';
import { seedDemoData } from '../../demo/seed.js';
import { passwordRecord } from '../../src/account/passwords.js';
import { openDatabase } from '../../src/db/open.js';
import { resolveModules } from '../../src/modules/catalog.js';
import { createApp } from '../../src/server.js';

const password = 'fixture-password';
const { salt, hash } = await passwordRecord(password);
const cookie = response => response.headers.get('set-cookie').split(';')[0];
export const csrf = body => body.match(/name="_csrf" value="([^"]+)"/)?.[1];

export function fixture(t, { selection = 'full', now, staffAccounts = [] } = {}) {
  const modules = resolveModules(selection);
  const db = openDatabase(':memory:', { modules });
  t.after(() => db.close());
  seedDemoData(db);
  const account = db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)');
  for (const [id, login] of [[1, 'mira'], [2, 'mark'], [1001, 'peer']]) account.run(id, login, salt, hash);
  if (modules.has('office')) {
    const staff = db.prepare('INSERT INTO staff_accounts (id, login, full_name, role, salt, password_hash) VALUES (?, ?, ?, ?, ?, ?)');
    staff.run(1, 'office', 'Демо Сотрудник', 'office', salt, hash);
    staff.run(2, 'teacher', 'Ирина Голубева', 'teacher', salt, hash);
    for (const row of staffAccounts) staff.run(...row, salt, hash);
  }
  if (modules.has('gradebook')) db.prepare('INSERT INTO teaching_assignments VALUES (?, ?, ?, ?)').run(2, 'Р-21', 'Регионоведение', 'Экзамен');
  const app = createApp(db, { secret: 'local-test-secret-for-app-suite-only', now });
  async function login(name) {
    const role = name === 'office' ? 'office' : name === 'teacher' ? 'teacher' : staffAccounts.find(row => row[1] === name)?.[3];
    const path = role ? '/office/login' : '/login';
    const entry = await app.request(path);
    const response = await app.request(path, {
      method: 'POST', headers: { cookie: cookie(entry) },
      body: new URLSearchParams({ login: name, password, _csrf: csrf(await entry.text()) }),
    });
    assert.equal(response.status, 303, name);
    const session = cookie(response);
    const get = (url, headers = {}) => app.request(url, { headers: { cookie: session, ...headers } });
    const page = async (url, status = 200, headers = {}) => {
      const response = await get(url, headers);
      assert.equal(response.status, status, url);
      return response.text();
    };
    const tokenPath = {
      teacher: modules.has('gradebook') ? '/office/gradebook' : '/office/consultations',
      leadership: '/office/urgent-appeals',
      office: '/office', admin: '/office',
    }[role] ?? '/';
    const token = csrf(await page(tokenPath));
    const post = (url, fields = {}) => app.request(url, {
      method: 'POST', headers: { cookie: session }, body: new URLSearchParams({ _csrf: token, ...fields }),
    });
    const mode = value => ({ cookie: `${session}; deanery_design=${value}` });
    return { get, page, post, mode };
  }
  return { app, db, login };
}

export const disciplinePath = subject => `/disciplines/${encodeURIComponent(subject)}`;
