import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { parseOfficeDate } from '../ui/date-input.js';
import { messagePage } from '../ui/layout.js';
import { assignedCourses, cancelSlot, changeBooking, createSlot, staffSlots, studentSlots, teachersForOffice, upcoming } from './consultations.js';
import { staffPage, studentPage } from './pages.js';

const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const field = value => typeof value === 'string' ? value.trim() : '';
const control = /[\u0000-\u001f\u007f]/u;
const isTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const studentContext = c => ({ student: c.get('student'), csrf: c.get('csrfToken'), active: 'consultations' });
const staffContext = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken'), active: 'consultations' });

export function studentRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const messages = modulesFor(db).get('messages');
  const render = (c, feedback = {}, status = 200) => c.html(studentPage({
    slots: studentSlots(db, c.get('student'), currentSchoolDay()),
    contacts: new Map(messages?.assignedTeachers(db, c.get('studentId')).map(row => [row.id, row.subjects])),
    feedback,
    context: studentContext(c),
  }), status);
  const missing = c => c.html(messagePage('Консультация не найдена', 'Откройте доступные встречи.',
    '/consultations', 'К консультациям', studentContext(c)), 404);

  routes.get('/', c => {
    const booked = idFrom(c.req.query('booked'));
    const cancelled = idFrom(c.req.query('cancelled'));
    return render(c, { booked, cancelled });
  });
  const change = book => c => {
    const id = idFrom(c.req.param('id'));
    const student = c.get('student');
    const now = currentSchoolDay();
    const topic = field(c.get('form').topic);
    if (book && (!topic || topic.length > 200 || control.test(topic))) {
      return studentSlots(db, student, now).some(slot => slot.id === id)
        ? render(c, { id, topic: topic.slice(0, 200), error: 'Введите тему в одну строку, до 200 символов.' }, 422)
        : missing(c);
    }
    const result = changeBooking(db, student, id, now, book, topic);
    if (result === 'missing') return missing(c);
    if (result === 'full') return render(c, { id, error: 'Свободных мест нет.' }, 409);
    if (result === 'started') return render(c, { error: 'Консультация уже началась.' }, 409);
    const confirmation = book ? 'booked' : 'cancelled';
    return c.redirect(`/consultations?${confirmation}=${id}#consultation-${id}`, 303);
  };
  routes.post('/:id/book', change(true));
  routes.post('/:id/cancel', change(false));
  return routes;
}

const names = ['teacher', 'subject', 'group', 'date', 'start', 'end', 'mode', 'room', 'capacity', 'note'];

export function staffRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const registry = modulesFor(db).get('registry');
  const formOptions = staff => {
    const teacher = staff.role === 'teacher';
    return {
      teacher,
      courses: teacher ? assignedCourses(db, staff.id) : [],
      groups: teacher ? [] : registry.groupsForOffice(db).map(group => group.code),
      teachers: teacher ? [] : teachersForOffice(db),
    };
  };
  const render = (c, input = {}, errors = {}, status = 200) => c.html(staffPage({
    slots: staffSlots(db, c.get('staff')).map(slot => ({ ...slot, upcoming: upcoming(slot, currentSchoolDay()) })),
    options: formOptions(c.get('staff')),
    input, errors, context: staffContext(c),
    saved: idFrom(c.req.query('saved')),
    cancelled: idFrom(c.req.query('cancelled')),
  }), status);
  routes.get('/', c => render(c));
  routes.post('/', c => {
    const staff = c.get('staff');
    const form = c.get('form');
    const input = Object.fromEntries(names.map(name => [name, field(form[name])]));
    const draft = {
      staff_id: staff.role === 'teacher' ? staff.id : idFrom(input.teacher),
      subject: input.subject, group_code: input.group || null, slot_date: parseOfficeDate(input.date),
      starts_at: input.start, ends_at: input.end, mode: input.mode,
      room: input.mode === 'offline' ? input.room : null,
      capacity: Number(input.capacity), note: input.note || null,
    };
    const errors = {};
    if (!draft.staff_id) errors.teacher = 'Выберите преподавателя.';
    if (!input.subject || input.subject.length > 240 || control.test(input.subject)) errors.subject = 'Введите название дисциплины, до 240 символов.';
    if (!draft.slot_date || draft.slot_date < currentSchoolDay().date) errors.date = 'Выберите сегодняшнюю или будущую дату.';
    if (!isTime(input.start) || (draft.slot_date && !upcoming(draft, currentSchoolDay()))) errors.start = 'Укажите будущее время в формате ЧЧ:ММ.';
    if (!isTime(input.end) || input.end <= input.start) errors.end = 'Введите время окончания после начала.';
    if (!['offline', 'online'].includes(input.mode)) errors.mode = 'Выберите формат встречи.';
    if (input.mode === 'offline' && (!input.room || input.room.length > 80 || control.test(input.room))) errors.room = 'Укажите аудиторию, до 80 символов.';
    if (!/^(?:[1-9]|1\d|20)$/.test(input.capacity)) errors.capacity = 'Укажите от 1 до 20 мест.';
    if (input.note.length > 500) errors.note = 'Сократите примечание до 500 символов.';
    const retained = Object.fromEntries(names.map(name => [name, input[name].slice(0, 500)]));
    if (Object.keys(errors).length) return render(c, retained, errors, 422);
    const result = createSlot(db, staff, draft);
    if (result === 'forbidden') return render(c, retained, { subject: 'Выберите дисциплину и группу из ваших назначений.' }, 403);
    if (result === 'teacher') return render(c, retained, { teacher: 'Этот преподаватель недоступен.' }, 422);
    if (result === 'group') return render(c, retained, { group: 'Группа не найдена.' }, 422);
    return c.redirect(`/office/consultations?saved=${result}#office-consultation-${result}`, 303);
  });
  routes.post('/:id/cancel', c => {
    const id = idFrom(c.req.param('id'));
    return cancelSlot(db, c.get('staff'), id, currentSchoolDay())
      ? c.redirect(`/office/consultations?cancelled=${id}#office-consultation-${id}`, 303)
      : c.html(messagePage('Консультация не найдена', 'Откройте встречи, которыми вы управляете.',
        '/office/consultations', 'К консультациям', staffContext(c)), 404);
  });
  return routes;
}
