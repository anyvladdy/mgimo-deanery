import { writeTransaction } from '../db/write.js';
import { modulesFor } from '../modules/config.js';
import { isDate } from '../modules/clock.js';
import { formatDate } from '../ui/format.js';

export function examCandidates(db) {
  const visibility = modulesFor(db).get('grades').pendingGradeVisibility(db);
  return db.prepare(`
    SELECT DISTINCT s.group_code, g.subject
    FROM grades g JOIN students s ON s.id = g.student_id JOIN academic_groups ag ON ag.code = s.group_code
    WHERE g.assessment = 'Экзамен' AND COALESCE(TRIM(g.result), '') = ''
      AND NOT EXISTS (
        SELECT 1 FROM grades latest
        WHERE latest.student_id = g.student_id AND latest.subject = g.subject AND latest.assessment = g.assessment
          AND latest.id > g.id
      ) AND ${visibility}
    ORDER BY s.group_code, g.subject
  `).all();
}

export const examKey = ({ group_code, subject }) => JSON.stringify([group_code, subject]);

export function latestExamSlot(db, exam) {
  return db.prepare(`
    SELECT id, exam_date, starts_at, building, room FROM exam_slots
    WHERE group_code = ? AND subject = ? ORDER BY id DESC LIMIT 1
  `).get(exam.group_code, exam.subject);
}

export function publishExam(db, exam, draft, version, staffId) {
  return writeTransaction(db, () => {
    if (!examCandidates(db).some(item => examKey(item) === examKey(exam))) return 'missing';
    const current = latestExamSlot(db, exam);
    const fields = ['exam_date', 'starts_at', 'building', 'room'];
    if (current && fields.every(field => current[field] === draft[field])) return 'ok';
    if ((current?.id ?? 0) !== version) return 'stale';
    db.prepare(`
      INSERT INTO exam_slots (group_code, subject, exam_date, starts_at, building, room, staff_id, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, deanery_timestamp())
    `).run(exam.group_code, exam.subject, draft.exam_date, draft.starts_at, draft.building, draft.room, staffId);
    return 'ok';
  });
}

export function examDetails({ exam_date, exam_time, exam_building, exam_room }) {
  return [
    isDate(exam_date) ? formatDate(exam_date) : '',
    exam_time ? `${exam_time} МСК` : '',
    exam_building,
    exam_room ? `ауд. ${exam_room}` : '',
  ].filter(Boolean).join(' · ');
}

export function previousExamDetails(row) {
  if (row.previous_exam_date) {
    return examDetails({
      exam_date: row.previous_exam_date, exam_time: row.previous_exam_time,
      exam_building: row.previous_exam_building, exam_room: row.previous_exam_room,
    });
  }
  return row.exam_version && row.scheduled_exam_date !== row.exam_date && isDate(row.scheduled_exam_date)
    ? formatDate(row.scheduled_exam_date) : '';
}

export function examSlotReadIds(db, studentId) {
  return db.prepare('SELECT slot_id FROM exam_slot_reads WHERE student_id = ?').all(studentId).map(row => row.slot_id);
}

export function markExamSlotRead(db, studentId, id) {
  db.prepare('INSERT INTO exam_slot_reads VALUES (?, ?) ON CONFLICT DO NOTHING').run(studentId, id);
}
