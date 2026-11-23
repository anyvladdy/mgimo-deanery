import { Hono } from 'hono';
import { gradesForStudent } from './grades.js';
import { gradesPage } from './pages.js';

export function gradesRoutes(db) {
  const routes = new Hono();
  routes.get('/', c => c.html(gradesPage(
    gradesForStudent(db, c.get('studentId')),
    c.get('student'),
    c.get('csrfToken'),
  )));
  return routes;
}
