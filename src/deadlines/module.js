import { Hono } from 'hono';
import { applySql } from '../db/sql.js';
import { modulesFor } from '../modules/config.js';
import { parseOfficeDate } from '../ui/date-input.js';
import { messagePage } from '../ui/layout.js';
import { addDeadline, calendarEvents, completeDeadline, deadlineForStudent, deadlinePassed, deadlinesForStudent, deleteDeadline, isDeadlineTime, titleLimit } from './deadlines.js';
import { deadlineForm, deadlinesPage } from './pages.js';

function deadlineId(c) {
  const raw = c.req.param('id');
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;
}

const options = c => ({ student: c.get('student'), csrf: c.get('csrfToken'), active: 'deadlines', date: c.req.query('date') });
const deadlinePath = id => `/deadlines#deadline-${id}`;

export default {
  id: 'deadlines',
  demoUpgrade: true,
  migrations: [db => applySql(db, new URL('./due-time.sql', import.meta.url))],
  services: { calendarEvents, deadlinesForStudent, deadlineForm },
  studentMount({ db, currentSchoolDay }) {
    const routes = new Hono();
    const calendar = modulesFor(db).get('calendar');
    const missing = c => c.html(messagePage('Дедлайн не найден', 'Откройте список доступных дедлайнов.',
      '/deadlines', 'К дедлайнам', options(c)), 404);
    const render = (c, fields, errors, status = 200, fromCalendar = false) => c.html(
      deadlinesPage(deadlinesForStudent(db, c.get('studentId')), currentSchoolDay(),
        { ...options(c), fromCalendar }, fields, errors),
      status,
    );
    routes.get('/', c => render(c));
    routes.get('/:id', c => {
      const id = deadlineId(c);
      return deadlineForStudent(db, c.get('studentId'), id) ? c.redirect(deadlinePath(id), 303) : missing(c);
    });
    routes.post('/', c => {
      const form = c.get('form');
      const fromCalendar = Boolean(calendar && form.source === 'calendar');
      const title = typeof form.title === 'string' ? form.title.trim() : '';
      const rawDate = typeof form.date === 'string' ? form.date.trim() : '';
      const date = parseOfficeDate(rawDate);
      const time = typeof form.time === 'string' ? form.time.trim() : '';
      const now = currentSchoolDay();
      const errors = {
        title: !title || title.length > titleLimit || /[\u0000-\u001f\u007f]/u.test(title)
          ? `Введите название в одну строку. Максимум ${titleLimit} знаков.` : '',
        date: !date || date < '0001-01-01' ? 'Введите существующую дату в формате ДД.ММ.ГГГГ.' : '',
        time: time && !isDeadlineTime(time) ? 'Введите время от 00:00 до 23:59 в формате ЧЧ:ММ.' : '',
      };
      if (!errors.date && date < now.date) errors.date = 'Выберите сегодняшнюю или будущую дату.';
      if (!errors.date && !errors.time && deadlinePassed(date, time, now)) {
        errors.time = 'Укажите время позже текущего по Москве.';
      }
      if (errors.title || errors.date || errors.time) {
        const fields = { title: title.slice(0, titleLimit), date: rawDate.slice(0, 10), time: time.slice(0, 5) };
        return render(c, fields, errors, 422, fromCalendar);
      }
      const id = addDeadline(db, c.get('studentId'), { title, date, time });
      if (fromCalendar) {
        const week = calendar.weekRange(date, now.date);
        if (date >= week.from && date <= week.to) {
          return c.redirect(`/calendar?date=${date}&kind=deadline&added=${id}#day-${date}`, 303);
        }
      }
      return c.redirect(deadlinePath(id), 303);
    });
    routes.post('/:id/complete', c => {
      const id = deadlineId(c);
      return completeDeadline(db, c.get('studentId'), id) ? c.redirect(deadlinePath(id), 303) : missing(c);
    });
    routes.post('/:id/delete', c => deleteDeadline(db, c.get('studentId'), deadlineId(c))
      ? c.redirect('/deadlines', 303) : missing(c));
    return ['/deadlines', routes];
  },
  navigation: (group, modules) => group === 'studentServices'
    ? [[20, '/deadlines', 'Дедлайны', 'deadlines', modules.has('calendar') ? '/calendar?kind=deadline' : undefined]] : [],
};
