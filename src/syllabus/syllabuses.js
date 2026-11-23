import { modulesFor } from '../modules/config.js';

export function listSyllabuses(db, text = '') {
  const search = text.toLocaleLowerCase('ru');
  return db.prepare('SELECT id, subject, summary FROM syllabuses ORDER BY subject').all()
    .filter(row => row.subject.toLocaleLowerCase('ru').includes(search));
}

export function syllabusForId(db, id) {
  return db.prepare('SELECT * FROM syllabuses WHERE id = ?').get(id);
}

function catalogQuery(db) {
  const modules = modulesFor(db);
  if (!modules.has('plan')) return '';
  const electives = modules.has('electives') ? 'UNION SELECT subject FROM plan_options' : '';
  return `SELECT subject FROM current_plan_courses ${electives}`;
}

export function subjectsWithoutSyllabus(db) {
  const catalog = catalogQuery(db);
  if (!catalog) return [];
  return db.prepare(`
    ${catalog}
    EXCEPT SELECT subject FROM syllabuses
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

  const catalog = catalogQuery(db);
  const eligibility = catalog ? `subject IN (${catalog})` : '1';
  const created = db.prepare(`
    INSERT INTO syllabuses (subject, summary, requirements, assessment, literature)
    SELECT subject, ?, ?, ?, ? FROM (SELECT ? AS subject) WHERE ${eligibility}
    ON CONFLICT(subject) DO NOTHING
    RETURNING id
  `).get(summary, requirements, assessment, literature, subject);
  return created?.id ?? null;
}

export function syllabusForSubject(db, subject) {
  return db.prepare('SELECT * FROM syllabuses WHERE subject = ?').get(subject);
}

export function formulaForSyllabus(db, id) {
  return db.prepare('SELECT * FROM syllabus_formulas WHERE syllabus_id = ?').get(id);
}

export function saveFormula(db, id, staffId, formula) {
  db.prepare(`
    INSERT INTO syllabus_formulas (syllabus_id, current_weight, exam_weight, scale, rounding, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, deanery_timestamp())
    ON CONFLICT(syllabus_id) DO UPDATE SET current_weight = excluded.current_weight,
      exam_weight = excluded.exam_weight, scale = excluded.scale, rounding = excluded.rounding,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(id, Number(formula.current_weight), Number(formula.exam_weight), formula.scale, formula.rounding, staffId);
}
