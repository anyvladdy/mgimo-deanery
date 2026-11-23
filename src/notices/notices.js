import { recentChangesForStudent, markChangeRead } from '../schedule/schedule.js';
import { clarificationNotices, readClarificationNotice } from '../requests/requests.js';
import { pendingAssessmentHref, upcomingAssessmentsForStudent } from '../grades/grades.js';

export function noticesForStudent(db, studentId, today) {
  const reads = new Set(db.prepare('SELECT kind, event_id FROM notification_reads WHERE student_id = ?').all(studentId)
    .map(row => `${row.kind}-${row.event_id}`));
  const changes = recentChangesForStudent(db, studentId).map(lesson => ({
    kind: 'room', id: lesson.change_id, read: Boolean(lesson.is_read), date: lesson.lesson_date,
    category: 'Перенос аудитории', title: lesson.subject,
    message: `${lesson.starts_at} · аудитория ${lesson.current_room}, раньше ${lesson.scheduled_room}`,
    href: `/schedule?date=${lesson.lesson_date}#lesson-${lesson.lesson_id}`,
  }));
  const reviews = db.prepare(`
    SELECT r.id, r.kind, r.status, c.subject, v.reviewed_at
    FROM request_reviews v JOIN document_requests r ON r.id = v.request_id
    LEFT JOIN request_courses c ON c.request_id = r.id
    WHERE r.student_id = ? ORDER BY v.reviewed_at DESC, r.id DESC LIMIT 25
  `).all(studentId).map(row => ({
    kind: 'request', id: row.id, date: row.reviewed_at, category: 'Решение по заявке',
    title: row.subject ?? row.kind, message: row.status, href: `/requests/${row.id}`,
  }));
  const grades = db.prepare(`
    SELECT g.id, g.subject, g.result, s.published_at
    FROM grades g JOIN grade_attempt_details d ON d.grade_id = g.id
    JOIN grade_sheets s ON s.id = d.sheet_id
    WHERE g.student_id = ? ORDER BY s.published_at DESC, g.id DESC LIMIT 25
  `).all(studentId).map(row => ({
    kind: 'grade', id: row.id, date: row.published_at, category: 'Новый результат',
    title: row.subject, message: row.result, href: `/grades/${row.id}/history`,
  }));
  const group = db.prepare(`
    SELECT n.id, n.kind, n.message, n.notice_date, g.block_id
    FROM students s JOIN notices n ON n.group_code = s.group_code
    LEFT JOIN notice_choice_blocks target ON target.notice_id = n.id
    LEFT JOIN plan_choice_groups g ON g.block_id = target.block_id AND g.group_code = s.group_code
    WHERE s.id = ? ORDER BY n.notice_date DESC, n.id DESC LIMIT 25
  `).all(studentId).map(row => ({
    kind: 'group', id: row.id, date: row.notice_date, category: row.kind, title: row.message,
    href: row.block_id === null ? null : `/plan#choice-${row.block_id}`,
  }));
  const clarifications = clarificationNotices(db, studentId).map(row => ({
    kind: 'clarification', id: row.id, date: row.asked_at, read: Boolean(row.read_at),
    category: 'Уточнение по заявке', title: row.subject ?? row.kind,
    message: row.answered_at ? 'Ответ передан в учебный офис' : 'Ответьте на вопрос учебного офиса',
    href: `/requests/${row.request_id}${row.answered_at ? '' : '#clarification'}`,
  }));
  const assessmentReads = new Set(db.prepare(`
    SELECT grade_id, exam_date FROM assessment_reminder_reads WHERE student_id = ? AND exam_date >= ?
  `).all(studentId, today).map(row => `${row.grade_id}:${row.exam_date}`));
  const assessments = upcomingAssessmentsForStudent(db, studentId, today).map(row => ({
    kind: 'exam', id: row.id, date: row.exam_date,
    read: assessmentReads.has(`${row.id}:${row.exam_date}`),
    category: 'Напоминание о сессии', title: row.subject, message: row.assessment,
    href: pendingAssessmentHref(row.id),
  }));
  return [...changes, ...clarifications, ...reviews, ...grades, ...group, ...assessments].map(event => ({
    ...event, read: event.read ?? reads.has(`${event.kind}-${event.id}`),
  })).sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
}

export function readNotice(db, studentId, kind, id, examDate, today) {
  if (kind === 'clarification') return readClarificationNotice(db, studentId, id);
  const event = noticesForStudent(db, studentId, today).find(event => event.kind === kind && event.id === id);
  if (!event || (kind === 'exam' && event.date !== examDate)) return false;
  if (kind === 'room') {
    markChangeRead(db, studentId, id);
  } else if (kind === 'exam') {
    db.prepare(`
      INSERT INTO assessment_reminder_reads (student_id, grade_id, exam_date) VALUES (?, ?, ?)
      ON CONFLICT DO NOTHING
    `).run(studentId, id, examDate);
  } else {
    db.prepare('INSERT INTO notification_reads VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(studentId, kind, id);
  }
  return true;
}
