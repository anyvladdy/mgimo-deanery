import { Hono } from 'hono';
import { schoolNow } from '../modules/clock.js';
import { modulesFor } from '../modules/config.js';
import { exportCalendar } from './ics.js';

export default {
  id: 'calendar-export',
  requires: ['calendar'],
  studentMount({ db, currentSchoolDay }) {
    const routes = new Hono();
    const calendar = modulesFor(db).get('calendar');
    routes.get('/export.ics', c => {
      const query = { ...c.req.queries(), view: ['week'] };
      const { events } = calendar.calendarView(db, c.get('studentId'), query, currentSchoolDay().date);
      return c.body(exportCalendar(events, schoolNow()), 200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="deanery-calendar.ics"',
      });
    });
    return ['/calendar', routes];
  },
};
