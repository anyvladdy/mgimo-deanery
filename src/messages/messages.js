import { writeTransaction } from '../db/write.js';
import { modulesFor } from '../modules/config.js';

export const subjectLimit = 100;
export const bodyLimit = 1600;

const accessibleThread = `(
  (:role = 'student' AND t.student_id = :viewerId)
  OR (:role = 'teacher' AND t.teacher_id = :viewerId)
  OR (:role IN ('office', 'admin') AND t.teacher_id IS NULL)
)`;

const summary = `
  SELECT t.id, t.channel, t.subject, student.full_name AS student_name,
         teacher.full_name AS teacher_name, work.assigned_to, work.closed_at, owner.full_name AS assignee,
         (t.teacher_id IS NULL OR (teacher.role = 'teacher' AND teacher.active = 1)) AS can_reply,
         latest.created_at AS updated_at, latest.staff_id IS NOT NULL AS last_from_staff
  FROM message_threads t
  JOIN students student ON student.id = t.student_id
  LEFT JOIN staff_accounts teacher ON teacher.id = t.teacher_id
  LEFT JOIN message_cases work ON work.thread_id = t.id
  LEFT JOIN staff_accounts owner ON owner.id = work.assigned_to
  JOIN thread_messages latest ON latest.id = (
    SELECT id FROM thread_messages WHERE thread_id = t.id ORDER BY id DESC LIMIT 1
  )
  WHERE ${accessibleThread}
`;

const viewerParams = viewer => ({ ':role': viewer.role, ':viewerId': viewer.id });

export function assignedTeachers(db, studentId) {
  if (!modulesFor(db).has('gradebook')) return [];
  const rows = db.prepare(`
    SELECT DISTINCT staff.id, staff.full_name, a.subject
    FROM students student
    JOIN teaching_assignments a ON a.group_code = student.group_code
    JOIN staff_accounts staff ON staff.id = a.staff_id AND staff.role = 'teacher' AND staff.active = 1
    WHERE student.id = ?
    ORDER BY staff.full_name, staff.id, a.subject
  `).all(studentId);

  return Array.from(Map.groupBy(rows, row => row.id), ([id, courses]) => ({
    id,
    name: courses[0].full_name,
    subjects: courses.map(course => course.subject),
  }));
}

export function listThreads(db, viewer, view = '') {
  const order = viewer.role === 'student' ? 'latest.id DESC' : 'work.closed_at IS NOT NULL, last_from_staff, latest.id DESC';
  const filter = view === 'waiting' ? 'AND work.closed_at IS NULL AND latest.staff_id IS NULL'
    : view === 'closed' ? 'AND work.closed_at IS NOT NULL' : '';
  return db.prepare(`${summary} ${filter} ORDER BY ${order}`).all(viewerParams(viewer));
}

export function findThread(db, viewer, id) {
  return db.prepare(`${summary} AND t.id = :threadId`).get({ ...viewerParams(viewer), ':threadId': id });
}

export function threadHistory(db, viewer, id) {
  return db.prepare(`
    SELECT m.id, m.staff_id, m.body, m.created_at, COALESCE(staff.full_name, student.full_name) AS author
    FROM thread_messages m
    JOIN message_threads t ON t.id = m.thread_id
    JOIN students student ON student.id = t.student_id
    LEFT JOIN staff_accounts staff ON staff.id = m.staff_id
    WHERE ${accessibleThread} AND t.id = :threadId
    ORDER BY m.id
  `).all({ ...viewerParams(viewer), ':threadId': id });
}

export function createThread(db, studentId, { channel, teacherId, subject, body, key }) {
  return writeTransaction(db, () => {
    const existing = db.prepare('SELECT id FROM message_threads WHERE student_id = ? AND request_key = ?')
      .get(studentId, key);
    if (existing) return existing.id;
    if (teacherId !== null && !assignedTeachers(db, studentId).some(teacher => teacher.id === teacherId)) return;
    const created = db.prepare(`
      INSERT INTO message_threads (student_id, teacher_id, channel, subject, request_key)
      VALUES (?, ?, ?, ?, ?) RETURNING id
    `).get(studentId, teacherId, channel, subject, key);
    db.prepare('INSERT INTO thread_messages (thread_id, body, request_key, created_at) VALUES (?, ?, ?, deanery_timestamp())')
      .run(created.id, body, key);
    return created.id;
  });
}

export function replyToThread(db, viewer, id, body, key) {
  return writeTransaction(db, () => {
    const params = { ...viewerParams(viewer), ':threadId': id,
      ':staffId': viewer.role === 'student' ? null : viewer.id, ':key': key };
    const message = db.prepare(`
      INSERT INTO thread_messages (thread_id, staff_id, body, request_key, created_at)
      SELECT t.id, :staffId, :body, :key, deanery_timestamp()
      FROM message_threads t
      LEFT JOIN staff_accounts teacher ON teacher.id = t.teacher_id
      LEFT JOIN message_cases work ON work.thread_id = t.id
      WHERE ${accessibleThread} AND t.id = :threadId
        AND (t.teacher_id IS NULL OR (teacher.role = 'teacher' AND teacher.active = 1))
        AND (work.closed_at IS NULL OR :role = 'student')
      ON CONFLICT(thread_id, request_key) DO NOTHING
      RETURNING id
    `).get({ ...params, ':body': body });
    if (!message) {
      return db.prepare(`
        SELECT m.id FROM thread_messages m
        JOIN message_threads t ON t.id = m.thread_id
        WHERE ${accessibleThread} AND t.id = :threadId
          AND m.request_key = :key AND m.staff_id IS :staffId
      `).get(params)?.id;
    }
    if (viewer.role === 'student') {
      db.prepare('UPDATE message_cases SET closed_at = NULL WHERE thread_id = ? AND closed_at IS NOT NULL').run(id);
    }
    if (['office', 'admin'].includes(viewer.role)) {
      db.prepare('INSERT INTO message_cases (thread_id, assigned_to) VALUES (?, ?) ON CONFLICT DO NOTHING')
        .run(id, viewer.id);
    }
    return message.id;
  });
}

export function updateCase(db, staff, id, action) {
  if (!['office', 'admin'].includes(staff.role)) return 'missing';
  return writeTransaction(db, () => {
    const thread = findThread(db, staff, id);
    let result = 'ok';
    if (!thread) result = 'missing';
    else if (!['assign', 'close'].includes(action)) result = 'invalid';
    else if (action === 'assign') {
      if (thread.closed_at || (thread.assigned_to && thread.assigned_to !== staff.id)) result = 'assigned';
      else db.prepare('INSERT INTO message_cases (thread_id, assigned_to) VALUES (?, ?) ON CONFLICT DO NOTHING')
        .run(id, staff.id);
    } else if (!thread.closed_at) {
      if (thread.assigned_to && thread.assigned_to !== staff.id && staff.role !== 'admin') result = 'assigned';
      else if (!thread.last_from_staff) result = 'unanswered';
      else db.prepare(`
        INSERT INTO message_cases (thread_id, assigned_to, closed_at) VALUES (?, ?, deanery_timestamp())
        ON CONFLICT(thread_id) DO UPDATE SET closed_at = excluded.closed_at
      `).run(id, staff.id);
    }
    return result;
  });
}

export function messageReplyNotices(db, studentId, unreadOnly = false) {
  const unread = unreadOnly ? 'AND seen.message_id IS NULL' : '';
  return db.prepare(`
    SELECT m.id, m.thread_id, m.created_at, substr(m.body, 1, 160) AS excerpt, length(m.body) > 160 AS clipped,
           t.subject, t.channel, staff.full_name,
           seen.message_id IS NOT NULL AS is_read
    FROM message_threads t
    JOIN thread_messages m ON m.thread_id = t.id AND m.staff_id IS NOT NULL
    JOIN staff_accounts staff ON staff.id = m.staff_id
    LEFT JOIN message_reply_reads seen ON seen.student_id = t.student_id AND seen.message_id = m.id
    WHERE t.student_id = ? ${unread}
    ORDER BY is_read, m.id DESC LIMIT 25
  `).all(studentId).map(row => ({
    kind: 'message', id: row.id, date: row.created_at, read: Boolean(row.is_read),
    category: row.channel === 'teacher' ? 'Ответ преподавателя' : 'Ответ учебного офиса',
    title: row.subject, message: `${row.full_name} · ${row.excerpt}${row.clipped ? '…' : ''}`,
    href: `/messages/${row.thread_id}#message-${row.id}`,
  }));
}

export function markMessageReplyRead(db, studentId, messageId) {
  return db.prepare(`
    INSERT INTO message_reply_reads (student_id, message_id)
    SELECT t.student_id, m.id
    FROM thread_messages m JOIN message_threads t ON t.id = m.thread_id
    WHERE t.student_id = ? AND m.id = ? AND m.staff_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `).run(studentId, messageId).changes > 0;
}
