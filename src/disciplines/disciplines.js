import { modulesFor } from '../modules/config.js';

export function courseDetails(db, student, course, schoolDay) {
  const modules = modulesFor(db);
  const { id, group_code } = student;
  const { subject, assessment } = course;
  const grades = modules.get('grades');
  const syllabuses = modules.get('syllabus');
  const schedule = modules.get('schedule');
  const messages = modules.get('messages');
  const exams = modules.get('exams');
  const syllabus = syllabuses?.syllabusForSubject(db, subject);
  const formula = syllabus && assessment === 'Экзамен' ? syllabuses.formulaForSyllabus(db, syllabus.id) : null;
  const lesson = schedule?.nextLessonForSubject(db, id, subject, schoolDay);
  const assigned = messages?.assignedTeachers(db, id).filter(teacher => teacher.subjects.includes(subject)) ?? [];
  const grade = grades.courseGrade(db, id, subject, assessment);
  const history = grade ? grades.gradeHistory(db, id, grade.id) : null;
  const slot = assessment === 'Экзамен' && !grade?.exam_version && !course.postponed
    ? exams?.latestExamSlot(db, { group_code, subject }) : null;
  const exam = slot ? {
    exam_date: slot.exam_date, exam_time: slot.starts_at, exam_building: slot.building, exam_room: slot.room,
  } : grade;
  return {
    syllabus, formula, lesson, grade, history,
    rulesAvailable: Boolean(syllabuses),
    scheduleAvailable: Boolean(schedule),
    examDate: exam?.exam_date,
    exam: exam?.exam_date ? exams?.examDetails(exam) : '',
    previousExam: grade && exams?.previousExamDetails(grade),
    teachers: assigned.length ? assigned.map(teacher => teacher.name)
      : [...new Set((schedule?.teachersForStudent(db, id) ?? [])
        .filter(row => row.subject === subject).map(row => row.teacher))],
    contactHref: assigned.length && syllabus ? `/messages/new?syllabus=${syllabus.id}`
      : assigned.length && lesson ? `/messages/new?lesson=${lesson.lesson_id}` : '',
  };
}

const scoreFields = ['current', 'exam', 'target'];

export function calculateGrade(formula, query) {
  if (!formula || !formula.exam_weight) return null;
  const values = Object.fromEntries(scoreFields.map(field => [field, (query[field] ?? '').trim().slice(0, 12)]));
  if (!scoreFields.some(field => query[field] !== undefined)) return { values, errors: {} };
  const errors = {};
  const scores = {};
  for (const field of scoreFields) {
    const value = values[field];
    if (!value && field !== 'current') continue;
    const tenths = Math.round(Number(value.replace(',', '.')) * 10);
    if (!/^\d{1,2}(?:[.,]\d)?$/.test(value) || tenths > Number(formula.scale) * 10 || query[field]?.trim().length > 12) {
      errors[field] = `Введите балл от 0 до ${formula.scale} с точностью до десятых.`;
    } else {
      scores[field] = tenths;
    }
  }
  if (Object.keys(errors).length) return { values, errors };
  const accumulated = formula.current_weight * scores.current;
  const weighted = scores.exam === undefined ? null : accumulated + formula.exam_weight * scores.exam;
  let total = null;
  if (weighted !== null) {
    if (formula.rounding === 'half_up') total = Math.round(weighted / 1000);
    else if (formula.rounding === 'down') total = Math.floor(weighted / 1000);
    else total = Math.floor(weighted / 10) / 100;
  }
  const target = scores.target === undefined ? null : scores.target * 100 - accumulated;
  const required = target === null ? null
    : target > Number(formula.scale) * 10 * formula.exam_weight ? Infinity
      : Math.max(0, Math.ceil(target * 10 / formula.exam_weight) / 100);
  return { values, errors, total, required };
}
