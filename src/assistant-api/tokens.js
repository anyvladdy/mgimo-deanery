import { createHash, randomBytes } from 'node:crypto';
import { writeTransaction } from '../db/write.js';

const tokenLifetime = 30 * 24 * 60 * 60 * 1000;
const tokenHash = token => createHash('sha256').update(token).digest('hex');

export function issueToken(db, studentId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + tokenLifetime;
  writeTransaction(db, () => {
    db.prepare(`
      INSERT INTO assistant_tokens (student_id, token_hash, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(student_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at
    `).run(studentId, tokenHash(token), expiresAt);
    db.prepare('DELETE FROM assistant_token_revocations WHERE student_id = ?').run(studentId);
  });
  return { token, expiresAt };
}

export function tokenAccess(db, studentId) {
  const state = db.prepare(`
    SELECT t.expires_at, r.revoked_at FROM students s
    LEFT JOIN assistant_tokens t ON t.student_id = s.id
    LEFT JOIN assistant_token_revocations r ON r.student_id = s.id
    WHERE s.id = ?
  `).get(studentId);
  return { expiresAt: state?.expires_at, revoked: Boolean(state?.revoked_at) };
}

export function revokeToken(db, studentId) {
  writeTransaction(db, () => {
    const result = db.prepare('DELETE FROM assistant_tokens WHERE student_id = ?').run(studentId);
    if (result.changes) {
      db.prepare(`INSERT INTO assistant_token_revocations (student_id, revoked_at) VALUES (?, ?)
        ON CONFLICT(student_id) DO UPDATE SET revoked_at = excluded.revoked_at`).run(studentId, Date.now());
    }
  });
}

export function studentForBearer(db, authorization) {
  const token = /^Bearer +([A-Za-z0-9_-]{43})$/i.exec(authorization ?? '')?.[1];
  if (!token) return undefined;
  return db.prepare('SELECT student_id FROM assistant_tokens WHERE token_hash = ? AND expires_at > ?')
    .get(tokenHash(token), Date.now())?.student_id;
}
