import { writeTransaction } from '../db/write.js';

// Один вид справки и начальный статус задаёт сервер, а не форма.
export const certificateKind = 'Справка об обучении';
export const initialStatus = 'Принята';
export const waitingStatus = 'Требуется уточнение';
export const clarificationLimit = 1000;
export const postponementKind = 'Перенос дисциплины';
export const readyStatus = 'Готова';
export const approvedStatus = 'Одобрено';
export const rejectedStatus = 'Отклонено';

// An open clarification adds a waiting state without changing final-review storage.
const visibleStatus = `CASE WHEN pending.id IS NULL THEN dr.status ELSE '${waitingStatus}' END`;
const pendingJoin = `LEFT JOIN request_clarifications pending ON pending.request_id = dr.id AND pending.answered_at IS NULL`;

const requestWithDetails = `
  SELECT dr.id, dr.kind, ${visibleStatus} AS status, dr.created_at, rc.subject, rc.assessment,
         review.comment, review.reviewed_at
  FROM document_requests dr
  LEFT JOIN request_courses rc ON rc.request_id = dr.id
  LEFT JOIN request_reviews review ON review.request_id = dr.id
  ${pendingJoin}
`;

export function listRequests(db, studentId) {
  return db.prepare(`
    ${requestWithDetails}
    WHERE dr.student_id = ?
    ORDER BY dr.created_at DESC, dr.id DESC
  `).all(studentId);
}

export function requestForStudent(db, studentId, requestId) {
  const request = db.prepare(`
    ${requestWithDetails}
    WHERE dr.id = ? AND dr.student_id = ?
  `).get(requestId, studentId);
  if (request) request.clarifications = db.prepare(`
    SELECT q.id, q.question, q.answer, q.asked_at, q.answered_at
    FROM request_clarifications q JOIN document_requests dr ON dr.id = q.request_id
    WHERE q.request_id = ? AND dr.student_id = ? ORDER BY q.id
  `).all(requestId, studentId);
  return request;
}

export function createCertificateRequest(db, studentId) {
  // Одна ожидающая справка на студента: повторная отправка формы открывает
  // существующую заявку, а не создаёт вторую строку в очереди офиса.
  return writeTransaction(db, () => {
    const created = db.prepare(`
      INSERT INTO document_requests (student_id, kind, status)
      SELECT ?, ?, ? WHERE NOT EXISTS (
        SELECT 1 FROM document_requests WHERE student_id = ? AND kind = ? AND status = ?
      )
      RETURNING id
    `).get(studentId, certificateKind, initialStatus, studentId, certificateKind, initialStatus);
    if (created) return Number(created.id);
    return Number(db.prepare(`
      SELECT id FROM document_requests
      WHERE student_id = ? AND kind = ? AND status = ?
      ORDER BY id LIMIT 1
    `).get(studentId, certificateKind, initialStatus).id);
  });
}

function coursesWithoutGrades(db, studentId) {
  return db.prepare(`
    SELECT p.subject, p.assessment
    FROM students s JOIN current_plan_courses p ON p.group_code = s.group_code
    WHERE s.id = ?
      AND COALESCE((
        SELECT TRIM(g.result) FROM grades g
        WHERE g.student_id = s.id AND g.subject = p.subject AND g.assessment = p.assessment
        ORDER BY g.id DESC LIMIT 1
      ), '') = ''
    ORDER BY p.subject, p.assessment
  `).all(studentId);
}

export function postponableCourses(db, studentId) {
  const liveRequests = new Set(listRequests(db, studentId)
    .filter(row => row.kind === postponementKind && [initialStatus, waitingStatus, approvedStatus].includes(row.status))
    .map(row => JSON.stringify([row.subject, row.assessment])));
  return coursesWithoutGrades(db, studentId)
    .filter(course => !liveRequests.has(JSON.stringify([course.subject, course.assessment])));
}

function matchesCourse(course, subject, assessment) {
  return course.subject === subject && course.assessment === assessment;
}

export function requestPostponement(db, studentId, subject, assessment) {
  return writeTransaction(db, () => {
    const existing = listRequests(db, studentId).find(row => row.kind === postponementKind
      && [initialStatus, waitingStatus, approvedStatus].includes(row.status) && matchesCourse(row, subject, assessment));
    if (existing) return existing.id;
    if (!coursesWithoutGrades(db, studentId).some(course => matchesCourse(course, subject, assessment))) return null;

    const row = db.prepare('INSERT INTO document_requests (student_id, kind, status) VALUES (?, ?, ?)')
      .run(studentId, postponementKind, initialStatus);
    db.prepare('INSERT INTO request_courses (request_id, subject, assessment) VALUES (?, ?, ?)')
      .run(row.lastInsertRowid, subject, assessment);
    return Number(row.lastInsertRowid);
  });
}

export function officeRequests(db, view = 'pending') {
  // Existing callers may still use the old boolean closed filter.
  const closed = view === 'closed' || view === true;
  const status = view === 'waiting' ? waitingStatus : initialStatus;
  return db.prepare(`
    SELECT dr.id, dr.kind, ${visibleStatus} AS status, dr.created_at,
           s.id AS student_id, s.full_name, s.group_code, course.subject
    FROM document_requests dr JOIN students s ON s.id = dr.student_id
    LEFT JOIN request_courses course ON course.request_id = dr.id
    ${pendingJoin}
    WHERE CASE WHEN ? THEN dr.status != ? AND pending.id IS NULL
               ELSE ${visibleStatus} = ? END
    ORDER BY dr.created_at DESC, dr.id DESC
  `).all(closed ? 1 : 0, initialStatus, status);
}

export function officeRequest(db, requestId) {
  const request = db.prepare(`
    SELECT dr.id, dr.kind, ${visibleStatus} AS status, dr.created_at, s.id AS student_id, s.full_name, s.group_code,
           course.subject, course.assessment, review.comment, review.reviewed_at, reviewer.full_name AS reviewer
    FROM document_requests dr JOIN students s ON s.id = dr.student_id
    LEFT JOIN request_courses course ON course.request_id = dr.id
    LEFT JOIN request_reviews review ON review.request_id = dr.id
    ${pendingJoin}
    LEFT JOIN staff_accounts reviewer ON reviewer.id = review.staff_id
    WHERE dr.id = ?
  `).get(requestId);
  if (request) request.clarifications = db.prepare(`
    SELECT q.id, q.question, q.answer, q.asked_at, q.answered_at, staff.full_name AS author
    FROM request_clarifications q JOIN staff_accounts staff ON staff.id = q.staff_id
    WHERE q.request_id = ? ORDER BY q.id
  `).all(requestId);
  return request;
}

function isCurrentCycle(request, cycle) {
  const latest = request.clarifications.at(-1)?.id ?? 0;
  return (latest === 0 && cycle === undefined) || String(latest) === cycle;
}

function clarificationText(value) {
  return typeof value === 'string' && value.length <= clarificationLimit ? value.trim() : '';
}

export function askClarification(db, staffId, requestId, question, cycle) {
  return writeTransaction(db, () => {
    const request = officeRequest(db, requestId);
    if (!request) return 'missing';
    if (request.status !== initialStatus || !isCurrentCycle(request, cycle)) return 'stale';
    const text = clarificationText(question);
    if (!text || ![certificateKind, postponementKind].includes(request.kind)) return 'invalid';
    db.prepare(`
      INSERT INTO request_clarifications (request_id, staff_id, question) VALUES (?, ?, ?)
    `).run(requestId, staffId, text);
    return 'ok';
  });
}

export function answerClarification(db, studentId, requestId, cycleId, answer) {
  return writeTransaction(db, () => {
    const cycle = db.prepare(`
      SELECT q.id, q.answered_at, dr.status,
             (SELECT MAX(id) FROM request_clarifications WHERE request_id = dr.id) AS latest
      FROM request_clarifications q JOIN document_requests dr ON dr.id = q.request_id
      WHERE dr.student_id = ? AND dr.id = ? AND q.id = ?
    `).get(studentId, requestId, cycleId);
    if (!cycle) return 'missing';
    if (cycle.id !== cycle.latest) return 'stale';
    if (cycle.answered_at) return 'already';
    if (cycle.status !== initialStatus) return 'stale';
    const text = clarificationText(answer);
    if (!text) return 'invalid';
    db.prepare(`
      UPDATE request_clarifications
      SET answer = ?, answered_at = CURRENT_TIMESTAMP, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).run(text, cycleId);
    return 'ok';
  });
}

export function outstandingClarifications(db, studentId) {
  return db.prepare(`
    SELECT dr.id, dr.kind, rc.subject
    FROM document_requests dr
    JOIN request_clarifications q ON q.request_id = dr.id AND q.answered_at IS NULL
    LEFT JOIN request_courses rc ON rc.request_id = dr.id
    WHERE dr.student_id = ? AND dr.status = ? ORDER BY q.id DESC
  `).all(studentId, initialStatus);
}

export function clarificationNotices(db, studentId) {
  return db.prepare(`
    SELECT q.id, q.asked_at, q.read_at, q.answered_at, dr.id AS request_id, dr.kind, rc.subject
    FROM document_requests dr
    JOIN request_clarifications q ON q.request_id = dr.id
    LEFT JOIN request_courses rc ON rc.request_id = dr.id
    WHERE dr.student_id = ?
      AND (q.answered_at IS NULL OR q.id IN (
        SELECT previous.id
        FROM request_clarifications previous
        JOIN document_requests owned ON owned.id = previous.request_id
        WHERE owned.student_id = ? AND previous.answered_at IS NOT NULL
        ORDER BY previous.id DESC LIMIT 25
      ))
    ORDER BY q.id DESC
  `).all(studentId, studentId);
}

export function readClarificationNotice(db, studentId, cycleId) {
  return db.prepare(`
    UPDATE request_clarifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE id = ? AND request_id IN (SELECT id FROM document_requests WHERE student_id = ?)
  `).run(cycleId, studentId).changes > 0;
}

export function reviewRequest(db, staffId, requestId, action, comment, cycle) {
  return writeTransaction(db, () => {
    const request = officeRequest(db, requestId);
    if (!request) return 'missing';
    if (request.status === waitingStatus) return 'waiting';
    if (request.status !== initialStatus) return 'reviewed';
    if (!isCurrentCycle(request, cycle)) return 'stale';
    let status;
    if (request.kind === certificateKind && action === 'ready') {
      status = readyStatus;
    } else if (request.kind === postponementKind && action === 'approve') {
      const eligible = coursesWithoutGrades(db, request.student_id)
        .some(course => matchesCourse(course, request.subject, request.assessment));
      if (!eligible) return 'ineligible';
      status = approvedStatus;
    } else if (request.kind === postponementKind && action === 'reject' && comment) {
      status = rejectedStatus;
    } else {
      return 'invalid';
    }
    db.prepare('UPDATE document_requests SET status = ? WHERE id = ?').run(status, requestId);
    db.prepare('INSERT INTO request_reviews (request_id, staff_id, comment) VALUES (?, ?, ?)').run(requestId, staffId, comment);
    return 'ok';
  });
}

export function approvedPostponements(db, studentId) {
  return db.prepare(`
    SELECT c.subject, c.assessment, dr.id
    FROM document_requests dr JOIN request_courses c ON c.request_id = dr.id
    WHERE dr.student_id = ? AND dr.kind = ? AND dr.status = ?
  `).all(studentId, postponementKind, approvedStatus);
}
