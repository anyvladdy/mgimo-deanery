import { createHash, randomBytes } from 'node:crypto';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';

const cookieName = 'deanery_session';
const eightHours = 8 * 60 * 60;
const keyFor = value => createHash('sha256').update(value).digest('hex');

export function sessions(db, secret, secure) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error('SESSION_SECRET должен содержать минимум 32 байта.');
  }
  const options = { httpOnly: true, sameSite: 'Lax', path: '/', secure };
  let lastCleanup = 0;

  function forget(c) {
    if (c.get('sessionKey')) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(c.get('sessionKey'));
    }
  }

  async function issue(c, studentId, { staffId = null } = {}) {
    if (studentId !== null && staffId !== null) throw new Error('У сессии может быть только один владелец.');
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const ttl = studentId === null && staffId === null ? 20 * 60 : eightHours;
    const sessionKey = keyFor(token);
    db.exec('BEGIN IMMEDIATE');
    try {
      forget(c);
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
      db.prepare('INSERT INTO sessions (id, student_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
        .run(sessionKey, studentId, csrf, now + ttl);
      if (staffId !== null) {
        db.prepare('INSERT INTO staff_sessions VALUES (?, ?)').run(sessionKey, staffId);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    await setSignedCookie(c, cookieName, token, secret, { ...options, maxAge: ttl });
    c.set('csrfToken', csrf);
  }

  async function load(c, next) {
    const now = Math.floor(Date.now() / 1000);
    if (now - lastCleanup >= 60) {
      lastCleanup = now;
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    }
    const token = await getSignedCookie(c, secret, cookieName);
    if (token) {
      const key = keyFor(token);
      const row = db.prepare(`
        SELECT s.student_id, s.csrf_token, a.id AS staff_id, a.full_name, a.role
        FROM sessions s
        LEFT JOIN staff_sessions staff ON staff.session_id = s.id
        LEFT JOIN staff_accounts a ON a.id = staff.staff_id AND a.active = 1
        WHERE s.id = ? AND s.expires_at > ?
      `).get(key, now);
      if (row) {
        c.set('sessionKey', key);
        c.set('studentId', row.student_id);
        if (row.staff_id !== null) c.set('staff', { id: row.staff_id, full_name: row.full_name, role: row.role });
        c.set('csrfToken', row.csrf_token);
      }
    }
    await next();
  }

  function logout(c) {
    forget(c);
    deleteCookie(c, cookieName, options);
  }
  return { load, issue, logout };
}

export async function requireStudent(c, next) {
  if (c.get('staff')) return c.redirect('/office', 303);
  if (!c.get('studentId')) return c.redirect('/login', 303);
  await next();
}
