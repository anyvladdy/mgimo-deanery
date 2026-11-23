import { Hono } from 'hono';
import { messagePage } from '../ui/layout.js';
import { academicGroup, addProgram, addGroup, enrollStudent, groupsForOffice, moveStudent, registryOverview } from './registry.js';
import { coursesToRetain } from '../plan/retained.js';
import { registryPage, enrollmentPage, enrollmentReceipt, movePage } from './pages.js';

const ctx = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
const field = (raw, max) => typeof raw === 'string' && raw.trim().length <= max ? raw.trim() : '';
const codePattern = /^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9-]{1,19}$/;
const loginPattern = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const validId = raw => /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;

export function registryRoutes(db) {
  const routes = new Hono();
  const overview = (c, error = '') => registryPage(registryOverview(db), ctx(c), error);
  routes.get('/', c => c.html(overview(c)));
  routes.post('/programs', c => {
    const { name, faculty } = c.get('form');
    const programName = field(name, 120);
    const facultyName = field(faculty, 120);
    if (!programName || !facultyName) return c.html(overview(c, 'Введите название программы и факультет.'), 422);
    return addProgram(db, programName, facultyName) ? c.redirect('/office/registry#programs', 303)
      : c.html(overview(c, 'Программа с таким названием уже есть.'), 409);
  });
  routes.post('/groups', c => {
    const { program, code, year } = c.get('form');
    const group = field(code, 20).toUpperCase();
    const programName = field(program, 120);
    const course = validId(year);
    if (!codePattern.test(group) || !programName || !course) {
      return c.html(overview(c, 'Выберите программу, укажите код группы и номер курса.'), 422);
    }
    return addGroup(db, programName, group, course) ? c.redirect('/office/registry#programs', 303)
      : c.html(overview(c, 'Код уже занят или выбранной программы нет в реестре.'), 409);
  });
  const enrollment = (c, values = {}, error = '') =>
    enrollmentPage(groupsForOffice(db), ctx(c), values, error);
  routes.get('/enroll', c => c.html(enrollment(c)));
  routes.post('/enroll', async c => {
    const form = c.get('form');
    const values = { name: field(form.name, 120), login: field(form.login, 40).toLowerCase(), group: field(form.group, 80) };
    if (!values.name || !loginPattern.test(values.login) || !values.group) {
      return c.html(enrollment(c, values, 'Заполните имя, логин и группу. Логин начинается с латинской буквы или цифры.'), 422);
    }
    const student = await enrollStudent(db, c.get('staff').id, values.name, values.login, values.group);
    if (student.error) {
      return c.html(enrollment(c, values, student.error === 'login' ? 'Этот логин уже занят.' : 'Группа отсутствует в реестре.'), 409);
    }
    return c.html(enrollmentReceipt(student, ctx(c)), 201);
  });
  const findStudent = id => db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  const missing = c => c.html(messagePage('Студент не найден', 'Откройте карточку из реестра.',
    '/office/students', 'Все студенты', ctx(c)), 404);
  routes.get('/students/:id/move', c => {
    const student = findStudent(validId(c.req.param('id')));
    if (!student) return missing(c);
    const groups = groupsForOffice(db).filter(group => group.code !== student.group_code);
    const target = academicGroup(db, field(c.req.query('group'), 80));
    const preview = target && target.code !== student.group_code ? target : null;
    return c.html(movePage(student, groups, preview, coursesToRetain(db, student.group_code, student.id), ctx(c)));
  });
  routes.post('/students/:id/move', c => {
    const id = validId(c.req.param('id'));
    const student = findStudent(id);
    if (!student) return missing(c);
    const form = c.get('form');
    const expected = field(form.expected, 80);
    const target = field(form.group, 80);
    if (!expected || !target) return c.redirect(`/office/registry/students/${id}/move`, 303);
    const result = moveStudent(db, c.get('staff').id, id, expected, target);
    if (result === 'ok') return c.redirect(`/office/students/${id}#movements`, 303);
    const groups = groupsForOffice(db).filter(group => group.code !== student.group_code);
    return c.html(movePage(student, groups, null, [], ctx(c),
      result === 'stale' ? 'Текущая группа изменилась. Посмотрите новый переход перед подтверждением.' : 'Выберите группу из реестра.'), 409);
  });
  return routes;
}
