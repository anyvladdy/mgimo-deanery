import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { actionsFor, searchForStudent } from './search.js';
import { searchPage } from './pages.js';

export function searchRoutes(db) {
  const routes = new Hono();
  const actions = actionsFor(modulesFor(db));
  routes.get('/', c => {
    const raw = c.req.query('q') ?? '';
    const query = raw.trim();
    const error = /[\u0000-\u001f\u007f-\u009f]/u.test(raw) || query.length > 100
      ? 'Введите до 100 символов в одну строку.' : '';
    const result = !error && query.length >= 2 ? searchForStudent(db, c.get('studentId'), query) : null;
    return c.html(searchPage({
      query: query.slice(0, 100), error, result, actions,
      student: c.get('student'), csrf: c.get('csrfToken'),
    }), error ? 422 : 200);
  });
  return routes;
}
