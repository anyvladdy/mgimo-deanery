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

  function forget(c) {
    if (c.get('sessionKey')) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(c.get('sessionKey'));
    }
  }

  async function issue(c, studentId) {
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(24).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const ttl = studentId === null ? 20 * 60 : eightHours;
    db.exec('BEGIN IMMEDIATE');
    try {
      forget(c);
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
      db.prepare('INSERT INTO sessions (id, student_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)')
        .run(keyFor(token), studentId, csrf, now + ttl);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    await setSignedCookie(c, cookieName, token, secret, { ...options, maxAge: ttl });
    c.set('csrfToken', csrf);
  }

  async function load(c, next) {
    const token = await getSignedCookie(c, secret, cookieName);
    if (token) {
      const key = keyFor(token);
      const row = db.prepare('SELECT student_id, csrf_token FROM sessions WHERE id = ? AND expires_at > unixepoch()').get(key);
      if (row) {
        c.set('sessionKey', key);
        c.set('studentId', row.student_id);
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
  if (!c.get('studentId')) return c.redirect('/login', 303);
  await next();
}
