import { Hono } from 'hono';
import { listSyllabuses, syllabusForId, saveSyllabus, subjectsWithoutSyllabus } from './syllabuses.js';
import { syllabusesPage, syllabusPage, syllabusEditor } from './pages.js';
import { messagePage } from '../ui/layout.js';

const field = (value, limit) => typeof value === 'string' && value.length <= limit ? value.trim() : '';
const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;

export function syllabusRoutes(db) {
  const routes = new Hono();
  routes.get('/', c => {
    const search = field(c.req.query('q'), 100);
    return c.html(syllabusesPage(listSyllabuses(db, search), search, { student: c.get('student'), csrf: c.get('csrfToken') }));
  });
  routes.get('/:id', c => {
    const syllabus = syllabusForId(db, idFrom(c.req.param('id')));
    return syllabus
      ? c.html(syllabusPage(syllabus, c.get('student'), c.get('csrfToken')))
      : c.html(messagePage('Силлабус не найден', 'Проверьте адрес дисциплины.', '/syllabuses', 'Все силлабусы',
        { student: c.get('student'), csrf: c.get('csrfToken'), active: 'plan' }), 404);
  });
  return routes;
}

// Маршруты монтируются внутри шлюза учебного офиса.
export function officeSyllabusRoutes(db) {
  const routes = new Hono();
  const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
  routes.get('/', c => {
    const search = field(c.req.query('q'), 100);
    return c.html(syllabusesPage(listSyllabuses(db, search), search, context(c)));
  });
  const editor = c => {
    const raw = c.req.param('id');
    const current = raw === 'new' ? {} : syllabusForId(db, idFrom(raw));
    if (!current) return c.html(messagePage('Силлабус не найден', 'Проверьте адрес.', '/office/syllabuses', 'Все силлабусы', context(c)), 404);
    const subjects = current.id ? [] : subjectsWithoutSyllabus(db);
    if (c.req.method === 'GET') {
      return c.html(syllabusEditor(current, subjects, context(c), '', c.req.query('saved') === '1' ? 'Силлабус опубликован' : ''));
    }
    const form = c.get('form');
    const draft = {
      ...current,
      subject: current.subject ?? field(form.subject, 240),
      summary: field(form.summary, 1200),
      requirements: field(form.requirements, 1200),
      assessment: field(form.assessment, 1200),
      literature: field(form.literature, 1200),
    };
    if ([draft.subject, draft.summary, draft.requirements, draft.assessment, draft.literature].some(value => !value)) {
      return c.html(syllabusEditor(draft, subjects, context(c), 'Заполните все поля силлабуса.'), 422);
    }
    const id = saveSyllabus(db, current.id, draft);
    return id ? c.redirect(`/office/syllabuses/${id}?saved=1`, 303)
      : c.html(syllabusEditor(draft, subjects, context(c), 'Для этой дисциплины уже есть силлабус или она отсутствует в плане.'), 409);
  };
  routes.get('/:id', editor);
  routes.post('/:id', editor);
  return routes;
}
