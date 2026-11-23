import { Hono } from 'hono';
import { messagePage } from '../ui/layout.js';
import { digestHref, digestPeriod, noticeDigest } from './digest.js';
import { readNotice } from './notices.js';
import { noticesPage } from './pages.js';

export function noticeRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  routes.get('/', c => {
    const filters = { unread: c.req.query('view') === 'unread', period: digestPeriod(c.req.query('period')) };
    return c.html(noticesPage(noticeDigest(db, c.get('studentId'), currentSchoolDay(), filters),
      filters, c.get('student'), c.get('csrfToken')));
  });
  routes.post('/read', c => {
    const form = c.get('form');
    const id = typeof form.event === 'string' && /^[1-9]\d*$/.test(form.event) ? Number(form.event) : 0;
    if (Number.isSafeInteger(id) && id > 0
        && readNotice(db, c.get('studentId'), form.kind, id, form.date, currentSchoolDay().date)) {
      return c.redirect(digestHref({ unread: form.view === 'unread', period: digestPeriod(form.period) }), 303);
    }
    return c.html(messagePage('Уведомление недоступно', 'Откройте актуальный список уведомлений.',
      '/notices', 'К уведомлениям', { student: c.get('student'), csrf: c.get('csrfToken'), active: 'notices' }), 404);
  });
  return routes;
}
