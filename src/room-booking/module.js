import { calendarEvents, isBooked } from './bookings.js';
import { roomBookingRoutes } from './routes.js';

export default {
  id: 'room-booking',
  demoUpgrade: 2,
  services: { calendarEvents, isBooked },
  studentMount: ({ db, currentSchoolDay }) => ['/room-booking', roomBookingRoutes(db, currentSchoolDay)],
  navigation: group => group === 'studentServices' ? [[10, '/room-booking', 'Бронь аудиторий', 'room-booking']] : [],
};
