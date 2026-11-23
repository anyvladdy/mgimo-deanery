import { writeTransaction } from '../db/write.js';

export const destinations = { program: 'Руководитель программы', dean: 'Декан факультета', rector: 'Ректор' };
const nextLevel = { program: 'dean', dean: 'rector' };
const levels = Object.keys(destinations);

function scopeFor(level, context) {
  if (level === 'program') return context.program;
  if (level === 'dean') return context.faculty;
  return '';
}

function activeRecipient(db, level, context) {
  return db.prepare(`
    SELECT r.staff_id FROM urgent_recipients r JOIN staff_accounts s ON s.id = r.staff_id
    WHERE r.level = ? AND r.scope = ? AND s.active = 1 AND s.role IN ('leadership', 'office', 'admin')
  `).get(level, scopeFor(level, context));
}

export function studentDestinations(db, student) {
  return levels.filter(level => activeRecipient(db, level, student));
}

export function createAppeal(db, student, draft) {
  return writeTransaction(db, () => {
    const duplicate = db.prepare('SELECT id FROM urgent_appeals WHERE student_id = ? AND request_key = ?')
      .get(student.id, draft.key);
    if (duplicate) return duplicate.id;
    if (!activeRecipient(db, draft.level, student)) return null;
    return db.prepare(`
      INSERT INTO urgent_appeals (student_id, request_id, program, faculty, level, subject, body, created_at, request_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, deanery_timestamp(), ?) RETURNING id
    `).get(student.id, draft.requestId, student.program, student.faculty, draft.level, draft.subject, draft.body, draft.key).id;
  });
}

export function studentAppeals(db, studentId) {
  return db.prepare('SELECT id, level, subject, created_at, resolved_at FROM urgent_appeals WHERE student_id = ? ORDER BY id DESC')
    .all(studentId);
}

export function studentAppeal(db, studentId, id) {
  return db.prepare('SELECT * FROM urgent_appeals WHERE student_id = ? AND id = ?').get(studentId, id);
}

const staffScope = `
  FROM urgent_appeals a JOIN urgent_recipients r ON r.level = a.level
    AND r.scope = CASE a.level WHEN 'program' THEN a.program WHEN 'dean' THEN a.faculty ELSE '' END
  JOIN students s ON s.id = a.student_id
  WHERE r.staff_id = ?
`;

export function staffAppeals(db, staffId) {
  return db.prepare(`
    SELECT a.id, a.level, a.subject, a.created_at, a.resolved_at, s.full_name ${staffScope}
    ORDER BY a.resolved_at IS NOT NULL, a.id DESC
  `).all(staffId);
}

export function staffAppeal(db, staffId, id) {
  return db.prepare(`SELECT a.*, s.full_name ${staffScope} AND a.id = ?`).get(staffId, id);
}

export function appealHistory(db, id) {
  return db.prepare('SELECT level, kind, occurred_at FROM urgent_appeal_events WHERE appeal_id = ? ORDER BY id').all(id);
}

export function availableNextLevel(db, appeal) {
  const next = nextLevel[appeal.level];
  return next && activeRecipient(db, next, appeal) ? next : null;
}

export function handleAppeal(db, staffId, id, { action, version, response }) {
  return writeTransaction(db, () => {
    const current = staffAppeal(db, staffId, id);
    if (!current) return 'missing';
    if (current.resolved_at || current.version !== version) return 'stale';
    const level = action === 'forward' ? availableNextLevel(db, current) : current.level;
    if (!level) return 'unavailable';
    if (action === 'forward') {
      db.prepare('UPDATE urgent_appeals SET level = ?, version = version + 1 WHERE id = ?').run(level, id);
    } else {
      db.prepare(`
        UPDATE urgent_appeals SET response = ?, resolved_at = deanery_timestamp(), version = version + 1 WHERE id = ?
      `).run(response, id);
    }
    db.prepare(`
      INSERT INTO urgent_appeal_events (appeal_id, staff_id, level, kind, occurred_at)
      VALUES (?, ?, ?, ?, deanery_timestamp())
    `).run(id, staffId, level, action === 'forward' ? 'forwarded' : 'resolved');
    return 'ok';
  });
}

export function eligibleRecipients(db) {
  return db.prepare(`
    SELECT id, full_name FROM staff_accounts WHERE active = 1 AND role IN ('leadership', 'office', 'admin') ORDER BY full_name, id
  `).all();
}

export function configuredRecipients(db) {
  return db.prepare(`
    SELECT r.level, r.scope, s.full_name, s.active, s.role
    FROM urgent_recipients r JOIN staff_accounts s ON s.id = r.staff_id ORDER BY r.level, r.scope
  `).all();
}

export function setRecipient(db, level, scope, staffId, { onlyIfEmpty = false } = {}) {
  return db.prepare(`
    INSERT INTO urgent_recipients (level, scope, staff_id)
    SELECT ?, ?, id FROM staff_accounts WHERE id = ? AND active = 1 AND role IN ('leadership', 'office', 'admin')
    ON CONFLICT (level, scope) ${onlyIfEmpty ? 'DO NOTHING' : 'DO UPDATE SET staff_id = excluded.staff_id'}
  `).run(level, scope, staffId).changes > 0;
}
