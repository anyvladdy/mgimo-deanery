// Один вид справки и начальный статус задаёт сервер, а не форма.
export const certificateKind = 'Справка об обучении';
export const initialStatus = 'Принята';

export function listRequests(db, studentId) {
  return db.prepare(`
    SELECT id, kind, status, created_at FROM document_requests
    WHERE student_id = ?
    ORDER BY created_at DESC, id DESC
  `).all(studentId);
}

export function requestForStudent(db, studentId, requestId) {
  return db.prepare(`
    SELECT id, kind, status, created_at FROM document_requests
    WHERE id = ? AND student_id = ?
  `).get(requestId, studentId);
}

export function createCertificateRequest(db, studentId) {
  const result = db.prepare(`
    INSERT INTO document_requests (student_id, kind, status) VALUES (?, ?, ?)
  `).run(studentId, certificateKind, initialStatus);
  return Number(result.lastInsertRowid);
}
