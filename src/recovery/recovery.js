import { createHash, randomBytes } from 'node:crypto';
import { passwordRecord } from '../account/passwords.js';
import { writeTransaction } from '../db/write.js';

export const codeLifetimeMinutes = 30;
const timestamp = () => Math.floor(Date.now() / 1000);
const codeHash = code => createHash('sha256').update(code).digest();

export function requestRecovery(db, login) {
  db.prepare(`
    INSERT INTO student_password_resets (student_id, created_at)
    SELECT a.student_id, deanery_timestamp() FROM accounts a WHERE a.login = ?
      AND NOT EXISTS (
        SELECT 1 FROM student_password_resets r WHERE r.student_id = a.student_id
          AND (r.status = 'pending' OR (r.status = 'approved' AND r.expires_at > ?))
      )
    ON CONFLICT DO NOTHING
  `).run(login, timestamp());
}

export function pendingRecoveries(db) {
  return db.prepare("SELECT COUNT(*) AS count FROM student_password_resets WHERE status = 'pending'").get().count;
}

export function recoveryQueue(db) {
  return db.prepare(`
    SELECT r.id, r.student_id, r.created_at, s.full_name, s.group_code, a.login, reviewer.full_name AS reviewer,
           CASE WHEN r.status = 'approved' AND r.expires_at <= ? THEN 'expired' ELSE r.status END AS status
    FROM student_password_resets r
    JOIN accounts a ON a.student_id = r.student_id
    JOIN students s ON s.id = r.student_id
    LEFT JOIN staff_accounts reviewer ON reviewer.id = r.reviewed_by
    ORDER BY r.status = 'pending' DESC, r.id DESC LIMIT 100
  `).all(timestamp());
}

export function reviewRecovery(db, id, staffId, action) {
  const approved = action === 'approve';
  const code = approved ? randomBytes(10).toString('hex') : null;
  const reviewed = db.prepare(`
    UPDATE student_password_resets
    SET status = ?, reviewed_by = ?, reviewed_at = deanery_timestamp(), code_hash = ?, expires_at = ?
    WHERE id = ? AND status = 'pending'
    RETURNING student_id
  `).get(approved ? 'approved' : 'rejected', staffId, code ? codeHash(code) : null,
    approved ? timestamp() + codeLifetimeMinutes * 60 : null, id);
  if (!reviewed) {
    const exists = db.prepare('SELECT 1 FROM student_password_resets WHERE id = ?').get(id);
    return { status: exists ? 'reviewed' : 'missing' };
  }
  if (!code) return { status: 'ok' };
  const student = db.prepare('SELECT id, full_name FROM students WHERE id = ?').get(reviewed.student_id);
  return { status: 'ok', code: code.toUpperCase().match(/.{4}/g).join('-'), student };
}

export async function resetPassword(db, login, code, password) {
  const digest = codeHash(code);
  const request = db.prepare(`
    SELECT r.id FROM student_password_resets r JOIN accounts a ON a.student_id = r.student_id
    WHERE a.login = ? AND r.status = 'approved' AND r.code_hash = ? AND r.expires_at > ?
  `).get(login, digest, timestamp());
  if (!request) return false;

  const { salt, hash } = await passwordRecord(password);
  return writeTransaction(db, () => {
    const consumed = db.prepare(`
      UPDATE student_password_resets SET status = 'completed', code_hash = NULL, expires_at = NULL
      WHERE id = ? AND status = 'approved' AND code_hash = ? AND expires_at > ? RETURNING student_id
    `).get(request.id, digest, timestamp());
    if (!consumed) return false;
    db.prepare('UPDATE accounts SET salt = ?, password_hash = ? WHERE student_id = ?')
      .run(salt, hash, consumed.student_id);
    db.prepare('DELETE FROM sessions WHERE student_id = ?').run(consumed.student_id);
    return true;
  });
}
