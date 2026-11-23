import { parseTimestamp } from '../modules/clock.js';
import { modulesFor } from '../modules/config.js';
import { formatDate } from '../ui/format.js';

function feedOrder(left, right) {
  return Number(left.read) - Number(right.read)
    || Number(!left.deliveredAt) - Number(!right.deliveredAt)
    || (parseTimestamp(right.deliveredAt ?? right.date) - parseTimestamp(left.deliveredAt ?? left.date))
    || right.id - left.id;
}

export function groupNotices(db, studentId, modules = modulesFor(db)) {
  const choices = modules.has('electives');
  return db.prepare(`
    SELECT n.id, n.kind, n.message, n.notice_date, ${choices ? 'g.block_id' : 'NULL AS block_id'}
    FROM students s JOIN notices n ON n.group_code = s.group_code
    ${choices ? `LEFT JOIN notice_choice_blocks target ON target.notice_id = n.id
      LEFT JOIN plan_choice_groups g ON g.block_id = target.block_id AND g.group_code = s.group_code` : ''}
    WHERE s.id = ? AND NOT EXISTS (
      SELECT 1 FROM notice_requirements r
      WHERE r.notice_id = n.id AND r.module_id NOT IN (SELECT value FROM json_each(?))
    )
    ORDER BY n.notice_date DESC, n.id DESC LIMIT 25
  `).all(studentId, JSON.stringify(modules.ids)).map(row => ({
    kind: 'group', id: row.id, date: row.notice_date, category: row.kind, title: row.message,
    href: row.block_id === null ? null : `/plan#choice-${row.block_id}`,
  }));
}

function assessmentNotices(db, studentId, today, grades, exams) {
  const assessmentReads = new Set(grades.assessmentReminderReads(db, studentId, today)
    .map(row => `${row.grade_id}:${row.exam_date}`));
  const slotReads = new Set(exams?.examSlotReadIds(db, studentId));
  return grades.upcomingAssessmentsForStudent(db, studentId, today).map(row => {
    const previous = exams?.previousExamDetails(row);
    const details = exams?.examDetails(row) ?? formatDate(row.exam_date);
    const message = previous ? `Было: ${previous}. Сейчас: ${details}.` : `${row.assessment} · ${details}`;
    return {
      kind: row.exam_version ? 'exam-slot' : 'exam', id: row.exam_version ?? row.id, date: row.exam_date,
      deliveredAt: row.exam_published_at, startsAt: row.exam_time,
      read: row.exam_version ? slotReads.has(row.exam_version) : assessmentReads.has(`${row.id}:${row.exam_date}`),
      category: previous ? 'Изменение экзамена' : 'Напоминание о сессии', title: row.subject, message,
      href: grades.pendingAssessmentHref(row.id),
    };
  });
}

export function noticesForStudent(db, studentId, today) {
  const modules = modulesFor(db);
  const schedule = modules.get('schedule');
  const requests = modules.get('requests');
  const grades = modules.get('grades');
  const messages = modules.get('messages');
  const review = modules.has('request-review');
  const reads = new Set(db.prepare('SELECT kind, event_id FROM notification_reads WHERE student_id = ?').all(studentId)
    .map(row => `${row.kind}-${row.event_id}`));
  const changes = schedule?.recentChangesForStudent(db, studentId).map(lesson => ({
    kind: 'room', id: lesson.change_id, read: Boolean(lesson.is_read), date: lesson.lesson_date,
    deliveredAt: lesson.published_at, startsAt: lesson.starts_at,
    category: 'Перенос аудитории', title: lesson.subject,
    message: `${formatDate(lesson.lesson_date)} · ${lesson.starts_at} · аудитория ${lesson.current_room}, раньше ${lesson.scheduled_room}`,
    href: `/schedule?date=${lesson.lesson_date}#lesson-${lesson.lesson_id}`,
  })) ?? [];
  const clarifications = review ? requests.clarificationNotices(db, studentId).map(row => ({
    kind: 'clarification', id: row.id, date: row.asked_at, read: Boolean(row.read_at), deliveredAt: row.asked_at,
    category: 'Уточнение по заявке', title: row.subject ?? row.kind,
    message: row.answered_at ? 'Ответ передан в учебный офис' : 'Ответьте на вопрос учебного офиса',
    href: `/requests/${row.request_id}${row.answered_at ? '' : '#clarification'}`,
  })) : [];
  const reviews = review ? requests.reviewedRequestsForStudent(db, studentId).map(row => ({
    kind: 'request', id: row.id, date: row.reviewed_at, deliveredAt: row.reviewed_at, category: 'Решение по заявке',
    title: row.subject ?? row.kind, message: row.status, href: `/requests/${row.id}`,
  })) : [];
  const publications = modules.get('gradebook')?.publishedResultsForStudent(db, studentId).map(row => ({
    kind: 'grade', id: row.id, date: row.published_at, deliveredAt: row.published_at, category: 'Новый результат',
    title: row.subject, message: row.result, href: `/grades/${row.id}/history`,
  })) ?? [];
  const group = groupNotices(db, studentId, modules);
  const assessments = grades ? assessmentNotices(db, studentId, today, grades, modules.get('exams')) : [];
  const replies = messages?.messageReplyNotices(db, studentId).map(reply => ({ ...reply, deliveredAt: reply.date })) ?? [];
  return [...changes, ...clarifications, ...reviews, ...publications, ...group, ...assessments, ...replies].map(event => ({
    ...event, read: event.read ?? reads.has(`${event.kind}-${event.id}`),
  })).sort(feedOrder);
}

export function readNotice(db, studentId, kind, id, examDate, today) {
  const modules = modulesFor(db);
  if (kind === 'clarification') {
    return modules.has('request-review') && modules.get('requests').readClarificationNotice(db, studentId, id);
  }
  const event = noticesForStudent(db, studentId, today).find(event => event.kind === kind && event.id === id);
  if (!event || (kind === 'exam' && event.date !== examDate)) return false;
  if (kind === 'room') {
    modules.get('schedule').markChangeRead(db, studentId, id);
  } else if (kind === 'exam') {
    modules.get('grades').markAssessmentReminderRead(db, studentId, id, examDate);
  } else if (kind === 'exam-slot') {
    modules.get('exams').markExamSlotRead(db, studentId, id);
  } else if (kind === 'message') {
    modules.get('messages').markMessageReplyRead(db, studentId, id);
  } else {
    db.prepare('INSERT INTO notification_reads VALUES (?, ?, ?) ON CONFLICT DO NOTHING').run(studentId, kind, id);
  }
  return true;
}
