import { Hono } from 'hono';
import { messagePage } from '../ui/layout.js';
import { listRequests, requestForStudent, createCertificateRequest } from './requests.js';
import { requestsPage, requestPage } from './pages.js';

export function requestRoutes(db) {
  const routes = new Hono();

  routes.get('/', c => {
    return c.html(requestsPage(listRequests(db, c.get('studentId')), c.get('csrfToken'), c.get('student')));
  });

  routes.post('/', c => {
    const id = createCertificateRequest(db, c.get('studentId'));
    return c.redirect(`/requests/${id}`, 303);
  });

  routes.get('/:id', c => {
    const raw = c.req.param('id');
    const id = /^\d+$/.test(raw) ? Number(raw) : 0;
    const request = Number.isSafeInteger(id) && id > 0 ? requestForStudent(db, c.get('studentId'), id) : undefined;
    if (!request) {
      return c.html(messagePage(
        'Заявка не найдена',
        'Такой заявки нет или она принадлежит другому студенту.',
        '/requests',
        'К моим заявкам',
        { student: c.get('student'), csrf: c.get('csrfToken'), active: 'requests' },
      ), 404);
    }
    return c.html(requestPage(request, c.get('csrfToken'), c.get('student')));
  });

  return routes;
}
