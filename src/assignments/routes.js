import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { parseOfficeDate } from '../ui/date-input.js';
import { messagePage } from '../ui/layout.js';
import {
  assignmentForStaff, assignmentForStudent, assignmentsForStaff, canSubmit, courseKey,
  publishAssignment, reviewSubmission, studentAssignmentsFor, submissionsForStaff, submitAssignment,
} from './assignments.js';
import { assignmentPage, assignmentsPage, staffAssignmentPage, staffAssignmentsPage } from './pages.js';

const field = value => typeof value === 'string' ? value.trim() : '';
const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const line = /[\u0000-\u001f\u007f]/u;
const tokenFormat = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const studentContext = c => ({ student: c.get('student'), csrf: c.get('csrfToken'), active: 'assignments' });
const staffContext = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken'), active: 'assignments' });

function normalizeLink(link) {
  if (!link) return '';
  if (link.length > 400 || line.test(link)) return null;
  try {
    const url = new URL(link);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 400 ? url.href : null;
  } catch {
    return null;
  }
}

export function studentRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const read = c => assignmentForStudent(db, c.get('studentId'), idFrom(c.req.param('id')));
  const missing = c => c.html(messagePage('Задание не найдено', 'Откройте список заданий вашей группы.',
    '/assignments', 'К заданиям', studentContext(c)), 404);
  const detail = (c, item, status = 200, feedback = {}) => c.html(assignmentPage(item, {
    ...studentContext(c), canSubmit: canSubmit(item, currentSchoolDay().date),
    saved: c.req.query('submitted') === '1', ...feedback,
  }), status);

  routes.get('/', c => c.html(assignmentsPage(studentAssignmentsFor(db, c.get('studentId')), studentContext(c))));
  routes.get('/:id', c => {
    const assignment = read(c);
    return assignment ? detail(c, assignment) : missing(c);
  });
  routes.post('/:id/submit', c => {
    const assignment = read(c);
    if (!assignment) return missing(c);
    const form = c.get('form');
    const input = { text: field(form.text), link: field(form.link) };
    const link = normalizeLink(input.link);
    const draft = { text: input.text.slice(0, 1200), link: input.link.slice(0, 400) };
    if (link === null) return detail(c, assignment, 422, { error: 'Введите ссылку с http:// или https://.', field: 'link', draft });
    if ((!link && !input.text) || input.text.length > 1200) {
      return detail(c, assignment, 422, { error: 'Добавьте ссылку или текст до 1200 символов.', field: 'text', draft });
    }
    const result = submitAssignment(db, c.get('studentId'), assignment.id, {
      text: input.text, link, revision: form.revision === '0' ? 0 : idFrom(form.revision) || -1,
    }, currentSchoolDay().date);
    if (result === 'ok') return c.redirect(`/assignments/${assignment.id}?submitted=1`, 303);
    if (result === 'missing') return missing(c);
    return detail(c, read(c), 409, { error: result === 'closed' ? 'Приём работы закрыт.' : 'Работа обновилась. Проверьте текущую версию.' });
  });
  return routes;
}

export function staffRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const gradebook = modulesFor(db).get('gradebook');
  const catalog = c => gradebook.coursesForStaff(db, c.get('staff'));
  const read = c => assignmentForStaff(db, catalog(c), idFrom(c.req.param('id')));
  const missing = c => c.html(messagePage('Задание или работа не найдены', 'Откройте задания по вашим дисциплинам.',
    '/office/assignments', 'К заданиям', staffContext(c)), 404);
  const list = (c, status = 200, feedback = {}) => {
    const courses = catalog(c);
    return c.html(staffAssignmentsPage(assignmentsForStaff(db, courses), courses, {
      ...staffContext(c), key: randomUUID(), ...feedback,
    }), status);
  };
  const detail = (c, item, status = 200, feedback = {}) => c.html(staffAssignmentPage(item, submissionsForStaff(db, item.id), {
    ...staffContext(c), saved: c.req.query('saved') === '1', ...feedback,
  }), status);

  routes.get('/', c => list(c));
  routes.post('/', c => {
    const form = c.get('form');
    const raw = { course: field(form.course), title: field(form.title), description: field(form.description), date: field(form.date) };
    const date = parseOfficeDate(raw.date);
    const draft = { ...raw, title: raw.title.slice(0, 150), description: raw.description.slice(0, 1500), date: raw.date.slice(0, 10) };
    const course = catalog(c).find(row => courseKey(row) === raw.course);
    if (!course) return list(c, 422, { draft, error: 'Выберите одну из доступных дисциплин.', field: 'course' });
    if (!raw.title || raw.title.length > 150 || line.test(raw.title)) return list(c, 422, { draft, error: 'Введите заголовок в одну строку, до 150 символов.', field: 'title' });
    if (!raw.description || raw.description.length > 1500) return list(c, 422, { draft, error: 'Добавьте описание до 1500 символов.', field: 'description' });
    if (!date || date < currentSchoolDay().date) return list(c, 422, { draft, error: 'Выберите сегодняшнюю или будущую дату.', field: 'date' });
    if (!tokenFormat.test(field(form.key))) return list(c, 422, { draft, error: 'Форма устарела. Повторите публикацию.' });
    const id = publishAssignment(db, c.get('staff').id, course, { ...raw, date, key: form.key });
    return c.redirect(`/office/assignments/${id}?saved=1`, 303);
  });
  routes.get('/:id', c => {
    const item = read(c);
    return item ? detail(c, item) : missing(c);
  });
  routes.post('/:id/submissions/:studentId', c => {
    const item = read(c);
    if (!item) return missing(c);
    const form = c.get('form');
    const status = form.status;
    const feedback = field(form.feedback);
    const studentId = idFrom(c.req.param('studentId'));
    const revision = idFrom(form.revision);
    if (!['reviewed', 'returned'].includes(status) || feedback.length > 800 || (status === 'returned' && !feedback) || !revision) {
      return detail(c, item, 422, { studentId, draft: feedback.slice(0, 800), error: 'При возврате добавьте комментарий до 800 символов.' });
    }
    const result = reviewSubmission(db, c.get('staff').id, item.id, studentId, { status, feedback, revision });
    if (result === 'missing') return missing(c);
    if (result === 'stale') return detail(c, item, 409, { studentId, error: 'Работа обновилась. Откройте текущую версию.' });
    return c.redirect(`/office/assignments/${item.id}?saved=1#submission-${studentId}`, 303);
  });
  return routes;
}
