import { Hono } from 'hono';
import { demoDate } from '../modules/clock.js';
import { parseOfficeDate } from '../ui/date-input.js';
import { messagePage } from '../ui/layout.js';
import { roomPublicationPage, roomSchedulePage } from './pages.js';
import { lessonForPublication, lessonsOnDate, maxRoomLength, normalizeRoom, publishRoom } from './publication.js';

const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const missing = c => c.html(messagePage('Занятие не найдено', 'Выберите занятие в расписании.',
  '/office/schedule', 'К расписанию', context(c)), 404);

const errors = {
  invalid: `Введите одну аудиторию, до ${maxRoomLength} знаков в одной строке.`,
  unchanged: 'Укажите аудиторию, которая отличается от исходной.',
  conflict: 'Для занятия уже опубликована другая аудитория.',
  booked: 'Аудитория забронирована на это время. Выберите другую.',
};

export function roomPublicationRoutes(db) {
  const routes = new Hono();
  routes.get('/', c => {
    const requested = c.req.query('date');
    const date = parseOfficeDate(requested ?? demoDate);
    if (!date) return c.html(roomSchedulePage('', [], context(c), {
      dateInput: requested?.slice(0, 10), dateError: 'Введите существующую дату в формате ДД.ММ.ГГГГ.',
    }), 422);
    return c.html(roomSchedulePage(date, lessonsOnDate(db, date), context(c)));
  });
  routes.get('/:id', c => {
    const lesson = lessonForPublication(db, idFrom(c.req.param('id')));
    return lesson ? c.html(roomPublicationPage(lesson, context(c))) : missing(c);
  });
  routes.post('/:id', async c => {
    const id = idFrom(c.req.param('id'));
    // Preserve duplicate room fields so they can be rejected as ambiguous.
    const form = await c.req.parseBody({ all: true });
    const room = normalizeRoom(form.room);
    const { outcome, lesson } = publishRoom(db, id, c.get('staff').id, room);
    if (outcome === 'missing') return missing(c);
    if (outcome === 'published') return c.redirect(`/office/schedule/${id}`, 303);
    return c.html(roomPublicationPage(lesson, context(c), { error: errors[outcome], room }),
      ['conflict', 'booked'].includes(outcome) ? 409 : 422);
  });
  return routes;
}
