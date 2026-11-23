export function listSyllabuses(db, text = '') {
  const search = text.toLocaleLowerCase('ru');
  return db.prepare('SELECT id, subject, summary FROM syllabuses ORDER BY subject').all()
    .filter(row => row.subject.toLocaleLowerCase('ru').includes(search));
}

export function syllabusForId(db, id) {
  return db.prepare('SELECT * FROM syllabuses WHERE id = ?').get(id);
}

export function subjectsWithoutSyllabus(db) {
  return db.prepare(`
    SELECT subject FROM current_plan_courses
    UNION
    SELECT subject FROM plan_options
    EXCEPT
    SELECT subject FROM syllabuses
    ORDER BY subject
  `).all().map(row => row.subject);
}

export function saveSyllabus(db, id, syllabus) {
  const { subject, summary, requirements, assessment, literature } = syllabus;
  if (id) {
    db.prepare('UPDATE syllabuses SET summary = ?, requirements = ?, assessment = ?, literature = ? WHERE id = ?')
      .run(summary, requirements, assessment, literature, id);
    return id;
  }

  const created = db.prepare(`
    INSERT INTO syllabuses (subject, summary, requirements, assessment, literature)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM current_plan_courses WHERE subject = ? UNION SELECT 1 FROM plan_options WHERE subject = ?
    )
    ON CONFLICT(subject) DO NOTHING
    RETURNING id
  `).get(subject, summary, requirements, assessment, literature, subject, subject);
  return created?.id ?? null;
}
