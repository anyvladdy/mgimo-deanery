import { writeTransaction } from '../db/write.js';

export const titleLimit = 120;
export const timePattern = '(?:[01][0-9]|2[0-3]):[0-5][0-9]';
const deadlineTime = new RegExp(`^${timePattern}$`);

export function isDeadlineTime(value) {
  return deadlineTime.test(value);
}

export function deadlinePassed(date, time, now) {
  return date < now.date || (date === now.date && Boolean(time) && `${time}:00` <= now.time);
}

const visibleDeadlines = `
  SELECT d.id, d.title, d.due_date, d.due_time, (d.student_id IS NOT NULL) AS personal, c.completed_at
  FROM deadlines d
  JOIN students s ON s.id = ?
  LEFT JOIN deadline_completions c ON c.deadline_id = d.id AND c.student_id = s.id
  WHERE (d.student_id = s.id OR d.group_code = s.group_code)
`;

export function deadlineForStudent(db, studentId, id) {
  return db.prepare(`${visibleDeadlines} AND d.id = ?`).get(studentId, id);
}

export function deadlinesForStudent(db, studentId) {
  return db.prepare(`${visibleDeadlines} ORDER BY d.due_date, d.due_time IS NULL, d.due_time, d.id`).all(studentId);
}

export function addDeadline(db, studentId, { title, date, time }) {
  return writeTransaction(db, () => db.prepare(`
    INSERT INTO deadlines (student_id, title, due_date, due_time, created_at) VALUES (?, ?, ?, ?, deanery_timestamp())
    RETURNING id
  `).get(studentId, title, date, time || null).id);
}

export function completeDeadline(db, studentId, id) {
  return writeTransaction(db, () => {
    if (!deadlineForStudent(db, studentId, id)) return false;
    db.prepare(`
      INSERT INTO deadline_completions (deadline_id, student_id, completed_at)
      VALUES (?, ?, deanery_timestamp())
      ON CONFLICT (deadline_id, student_id) DO NOTHING
    `).run(id, studentId);
    return true;
  });
}

export function deleteDeadline(db, studentId, id) {
  return writeTransaction(db, () =>
    db.prepare('DELETE FROM deadlines WHERE id = ? AND student_id = ?').run(id, studentId).changes > 0);
}

export function calendarEvents(db, studentId, { from, to }) {
  return db.prepare(`${visibleDeadlines} AND c.completed_at IS NULL AND d.due_date BETWEEN ? AND ?`)
    .all(studentId, from, to).map(deadline => ({
      id: `deadline-${deadline.id}`,
      kind: 'deadline',
      title: deadline.title,
      date: deadline.due_date,
      ...(deadline.due_time ? { start: deadline.due_time } : {}),
      href: `/deadlines#deadline-${deadline.id}`,
      ...(!deadline.personal ? { details: 'Учебное напоминание' } : {}),
    }));
}

export function deadlineWeek(open, today) {
  const first = Date.parse(`${today}T00:00:00Z`);
  const counts = Map.groupBy(open, row => row.due_date);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first + index * 86_400_000).toISOString().slice(0, 10);
    return { date, count: counts.get(date)?.length ?? 0 };
  });
}
