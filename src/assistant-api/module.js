import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { integrationsPage } from './pages.js';
import { issueToken, revokeToken, studentForBearer, tokenAccess } from './tokens.js';

const openAPI = readFileSync(new URL('./openapi.json', import.meta.url), 'utf8');

function endDate(from, days) {
  const inclusiveEnd = new Date(`${from}T00:00:00Z`);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + days - 1);
  return inclusiveEnd.toISOString().slice(0, 10);
}

export default {
  id: 'assistant-api',
  requires: ['calendar'],
  studentMount({ db }) {
    const routes = new Hono();
    const render = (c, status, state) => c.html(integrationsPage({
      student: c.get('student'), csrf: c.get('csrfToken'), ...state,
    }), status);

    routes.get('/', c => render(c, 200, tokenAccess(db, c.get('studentId'))));
    routes.post('/token', c => render(c, 201, issueToken(db, c.get('studentId'))));
    routes.post('/revoke', c => {
      revokeToken(db, c.get('studentId'));
      return c.redirect('/integrations?revoked=1', 303);
    });
    return ['/integrations', routes];
  },
  publicMount({ db, currentSchoolDay }) {
    const { eventsForStudent } = modulesFor(db).get('calendar');
    const routes = new Hono();

    routes.get('/openapi.json', c => c.body(openAPI, 200, { 'Content-Type': 'application/json; charset=utf-8' }));
    routes.get('/deadlines', c => {
      const studentId = studentForBearer(db, c.req.header('Authorization'));
      if (studentId === undefined) {
        c.header('WWW-Authenticate', 'Bearer realm="deanery"');
        return c.json({ error: 'unauthorized' }, 401);
      }

      const query = new URL(c.req.url).searchParams;
      if ([...query.keys()].some(key => key !== 'days')) return c.json({ error: 'invalid_query' }, 400);
      const values = query.getAll('days');
      const days = values[0] ?? '30';
      if (values.length > 1 || !/^(?:[1-9]|[1-8]\d|90)$/.test(days)) {
        return c.json({ error: 'invalid_days' }, 400);
      }

      const from = currentSchoolDay().date;
      const to = endDate(from, Number(days));
      const deadlines = eventsForStudent(db, studentId, { from, to })
        .filter(({ kind }) => kind === 'deadline' || kind === 'tuition')
        .map(({ id, kind, title, date, start, href }) => ({ id, kind, title, date, ...(start ? { time: start } : {}), href }));
      return c.json({ from, to, deadlines });
    });
    return ['/api/v1', routes];
  },
  navigation: group => group === 'studentServices'
    ? [[64, '/integrations', 'Личный ассистент', 'assistant-api']] : [],
};
