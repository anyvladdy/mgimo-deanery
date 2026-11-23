import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { presentationVariant } from '../ui/presentation.js';
import { calendarView, eventsForStudent, weekRange } from './calendar.js';
import { calendarPage } from './pages.js';

export default {
  id: 'calendar',
  services: { calendarView, eventsForStudent, weekRange },
  studentMount({ db, currentSchoolDay }) {
    const routes = new Hono();
    const modules = modulesFor(db);
    const deadlines = modules.get('deadlines');
    const sources = [
      ['schedule', 'пары'], ['grades', 'экзамены'], ['campus-events', 'мероприятия'],
      ['deadlines', 'дедлайны'], ['room-booking', 'брони'], ['consultations', 'консультации'],
    ].filter(([id]) => modules.has(id)).map(([, label]) => label);
    const sourceList = new Intl.ListFormat('ru').format(sources);
    routes.get('/', c => {
      const { date: today } = currentSchoolDay();
      const calendar = calendarView(db, c.get('studentId'), c.req.queries(), today);
      const csrf = c.get('csrfToken');
      const rich = presentationVariant() !== 'lite';
      const added = c.req.query('added');
      return c.html(calendarPage({
        ...calendar,
        student: c.get('student'),
        csrf,
        deadlineForm: rich && deadlines && deadlines.deadlineForm(csrf, {
          date: calendar.selected >= today ? calendar.selected : today,
        }, {}, { fromCalendar: true }),
        deadlineAdded: added && calendar.events.some(event => event.kind === 'deadline' && event.id === `deadline-${added}`),
        description: sources.length ? `Ваш план на ${calendar.view === 'month' ? 'месяц' : 'неделю'} включает ${sourceList}.` : '',
        scheduleHref: modules.has('schedule') ? `/schedule?date=${calendar.selected}` : '',
        canExport: modules.has('calendar-export'),
      }));
    });
    return ['/calendar', routes];
  },
  navigation: group => group === 'studentTools' ? [[15, '/calendar', 'Личный календарь', 'calendar', 'week']] : [],
};
