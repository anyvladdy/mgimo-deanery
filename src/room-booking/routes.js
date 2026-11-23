import { Hono } from 'hono';
import { dateFilter, parseOfficeDate } from '../ui/date-input.js';
import { messagePage } from '../ui/layout.js';
import { bookingForStudent, bookingUrl, cancelBooking, createBooking, roomAvailability, rooms } from './bookings.js';
import { roomBookingPage } from './pages.js';

function bookingId(value) {
  const id = /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

export function roomBookingRoutes(db, currentSchoolDay) {
  const routes = new Hono();

  function render(c, values, error = '', status = 200) {
    const studentId = c.get('studentId');
    const now = currentSchoolDay();
    const { date: today } = now;
    const selection = dateFilter(values.date, today);
    const { date } = selection;
    const availableRooms = rooms(db);
    const room = availableRooms.find(room => room.code === values.room) ?? availableRooms[0];
    const availability = room && roomAvailability(db, studentId, room.code, date, now);
    const confirmed = bookingId(c.req.query('confirmed'));
    const cancelled = bookingId(c.req.query('cancelled'));
    const cancellation = cancelled && bookingForStudent(db, studentId, cancelled);
    let notice = '';
    if (!error && availability?.occupied.some(item => item.id === confirmed)) notice = 'Аудитория забронирована.';
    if (!error && cancellation?.cancelled_at && cancellation.room === room?.code && cancellation.booking_date === date) {
      notice = 'Бронь отменена.';
    }

    return c.html(roomBookingPage({
      ...selection, today, availableRooms, room, availability, values, error, notice,
      csrf: c.get('csrfToken'), student: c.get('student'),
    }), status);
  }

  routes.get('/', c => render(c, { room: c.req.query('room'), date: c.req.query('date') }));

  routes.post('/', c => {
    const values = c.get('form');
    const date = parseOfficeDate(values.date);
    const outcome = createBooking(db, c.get('studentId'), { ...values, date }, currentSchoolDay());
    if (outcome.error) return render(c, values, outcome.error, outcome.conflict ? 409 : 422);

    const url = bookingUrl(values.room, date);
    return c.redirect(`${url}&confirmed=${outcome.id}#booking-${outcome.id}`, 303);
  });

  routes.post('/:id/cancel', c => {
    const booking = cancelBooking(db, c.get('studentId'), bookingId(c.req.param('id')));
    if (booking) return c.redirect(`${bookingUrl(booking.room, booking.booking_date)}&cancelled=${booking.id}`, 303);

    return c.html(messagePage('Бронь не найдена', 'Откройте список аудиторий и проверьте выбранную дату.',
      '/room-booking', 'К бронированию аудиторий',
      { student: c.get('student'), csrf: c.get('csrfToken'), active: 'room-booking' }), 404);
  });

  return routes;
}
