// Студент выбирается из проверенной серверной сессии.
export function gradesForStudent(db, studentId) {
  return db.prepare(`
    SELECT id, subject, assessment, result, exam_date FROM grades
    WHERE student_id = ?
    ORDER BY id
  `).all(studentId);
}
