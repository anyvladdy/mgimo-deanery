import { Hono } from 'hono';
import { parseOfficeDate } from '../ui/date-input.js';
import { examCandidates, examKey, latestExamSlot, publishExam } from './exams.js';
import { examEditor } from './pages.js';

const field = (value, limit) => typeof value === 'string' && value.length <= limit && !value.includes('\0') ? value.trim() : '';

export function examRoutes(db) {
  const routes = new Hono();
  const context = c => ({ staff: c.get('staff'), csrf: c.get('csrfToken') });
  const chosen = (exams, key) => exams.find(exam => examKey(exam) === key);
  const unavailable = 'Выберите экзамен из списка группы и дисциплины.';

  routes.get('/', c => {
    const exams = examCandidates(db);
    const key = c.req.query('exam');
    const selected = chosen(exams, key);
    const slot = selected ? latestExamSlot(db, selected) : null;
    return c.html(examEditor(exams, selected, slot ?? {}, slot?.id ?? 0, context(c), {
      error: key && !selected ? unavailable : '', saved: Boolean(slot) && c.req.query('saved') === '1',
    }), key && !selected ? 404 : 200);
  });

  routes.post('/', c => {
    const body = c.get('form');
    const exams = examCandidates(db);
    const selected = chosen(exams, body.exam);
    if (!selected) return c.html(examEditor(exams, null, {}, 0, context(c), { error: unavailable }), 404);
    const current = latestExamSlot(db, selected);
    const action = body.action ?? 'publish';
    const version = typeof body.version === 'string' && /^\d+$/.test(body.version) ? Number(body.version) : -1;
    const dateInput = field(body.date, 10);
    const date = parseOfficeDate(dateInput);
    const draft = {
      exam_date: date || dateInput, starts_at: field(body.time, 5),
      building: field(body.building, 100), room: field(body.room, 32),
    };
    if (!date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.starts_at)
        || !draft.building || !draft.room || version < 0 || !Number.isSafeInteger(version)) {
      return c.html(examEditor(exams, selected, draft, version >= 0 && Number.isSafeInteger(version) ? version : current?.id ?? 0,
        context(c), date ? { error: 'Укажите время, корпус и аудиторию.' }
          : { dateError: 'Введите существующую дату в формате ДД.ММ.ГГГГ.' }), 422);
    }
    const conflict = slot => c.html(examEditor(exams, selected, slot ?? {}, slot?.id ?? 0, context(c), {
      error: 'Расписание уже обновили. Сверьте опубликованные данные и внесите правку снова.',
    }), 409);
    if (action === 'preview' || action === 'edit') {
      if ((current?.id ?? 0) !== version) return conflict(current);
      return c.html(examEditor(exams, selected, draft, version, context(c), { preview: action === 'preview' }));
    }
    if (action !== 'publish') return c.html(examEditor(exams, selected, draft, version, context(c), {
      error: 'Проверьте данные перед публикацией.',
    }), 422);
    const result = publishExam(db, selected, draft, version, c.get('staff').id);
    if (result === 'ok') {
      return c.redirect(`/office/exams?${new URLSearchParams({ exam: examKey(selected), saved: '1' })}`, 303);
    }
    if (result === 'missing') return c.html(examEditor(examCandidates(db), null, {}, 0, context(c), { error: unavailable }), 404);
    return conflict(latestExamSlot(db, selected));
  });
  return routes;
}
