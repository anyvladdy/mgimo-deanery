import { Hono } from 'hono';
import { messagePage } from '../ui/layout.js';
import { calendarEvents, changeRegistration, eventForStudent, eventsForStudent } from './events.js';
import { eventPage, eventsPage } from './pages.js';

function eventId(c) {
  const raw = c.req.param('id');
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;
}

const options = c => ({ student: c.get('student'), csrf: c.get('csrfToken'), active: 'campus-events' });

export default {
  id: 'campus-events',
  demoUpgrade: true,
  services: { calendarEvents, eventForStudent },
  studentMount({ db, currentSchoolDay }) {
    const routes = new Hono();
    const missing = c => c.html(messagePage('Событие не найдено', 'Доступные события есть в списке кампуса.',
      '/events', 'К событиям', options(c)), 404);
    routes.get('/', c => c.html(eventsPage(eventsForStudent(db, c.get('studentId')), currentSchoolDay(), options(c), c.req.query('cancelled'))));
    routes.get('/:id', c => {
      const event = eventForStudent(db, c.get('studentId'), eventId(c));
      const cancelled = !event?.registered && c.req.query('cancelled') === '1';
      return event ? c.html(eventPage(event, currentSchoolDay(), options(c), { cancelled })) : missing(c);
    });
    const update = register => c => {
      const id = eventId(c);
      const day = currentSchoolDay();
      const result = changeRegistration(db, c.get('studentId'), id, day, register);
      if (result.status === 'missing') return missing(c);
      if (result.status === 'closed') return c.html(eventPage(result.event, day, options(c), { closed: true }), 409);
      const cancelled = !register && result.changed;
      if (c.get('form').view === 'catalog') {
        return c.redirect(`/events${cancelled ? `?cancelled=${id}` : ''}#event-${id}`, 303);
      }
      return c.redirect(`/events/${id}${cancelled ? '?cancelled=1' : ''}`, 303);
    };
    routes.post('/:id/register', update(true));
    routes.post('/:id/cancel', update(false));
    return ['/events', routes];
  },
  navigation: group => group === 'studentServices' ? [[10, '/events', 'События кампуса', 'campus-events']] : [],
};
