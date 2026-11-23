import { html } from 'hono/html';
import { layout, messagePage } from '../ui/layout.js';
import { formulaForSyllabus, saveFormula, syllabusForId } from './syllabuses.js';

const weights = [['current_weight', 'Вес текущей работы, %'], ['exam_weight', 'Вес экзамена, %']];
const scales = { 5: 'До 5', 10: 'До 10' };
const rounding = { none: 'Без округления', half_up: 'До ближайшего целого', down: 'Вниз до целого' };

function options(values, selected) {
  return Object.entries(values).map(([value, label]) => html`<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`);
}

function formulaEditor(syllabus, context, values = {}, errors = {}, saved = false) {
  const firstError = Object.keys(errors)[0];
  const errorAttributes = name => errors[name] ? html`aria-invalid="true" aria-describedby="${name}-error"
    ${firstError === name ? 'autofocus' : ''}` : '';
  const errorText = name => errors[name] ? html`<p class="error" id="${name}-error" role="alert">${errors[name]}</p>` : '';
  return layout('Формула оценки', html`
    <main id="content" class="page narrow syllabus">
      <a class="back-link" href="/office/syllabuses/${syllabus.id}">Редактор силлабуса</a>
      <header class="identity"><h1>Формула оценки</h1><p>${syllabus.subject}</p></header>
      ${saved ? html`<p class="status-pill is-ready" role="status">Формула опубликована</p>` : ''}
      <form class="form-panel" method="post" autocomplete="off" action="/office/syllabuses/${syllabus.id}/formula">
        <input type="hidden" name="_csrf" value="${context.csrf}">
        <p class="hint">Укажите целые веса. Сумма должна быть 100%.</p>
        ${weights.map(([name, label]) => html`
          <label for="${name}">${label}</label>
          <input id="${name}" name="${name}" type="text" inputmode="numeric" required maxlength="3"
            value="${values[name] ?? ''}" ${errorAttributes(name)}>
          ${errorText(name)}`)}
        <label for="scale">Шкала</label>
        <select id="scale" name="scale" ${errorAttributes('scale')}>${options(scales, values.scale ?? '10')}</select>
        ${errorText('scale')}
        <label for="rounding">Округление итога</label>
        <select id="rounding" name="rounding" ${errorAttributes('rounding')}>${options(rounding, values.rounding)}</select>
        ${errorText('rounding')}
        <button class="primary">Опубликовать формулу</button>
      </form>
    </main>`, { ...context, active: 'office-syllabuses' });
}

export function formulaHandler(db, contextFor) {
  return c => {
    const raw = c.req.param('id');
    const id = /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;
    const syllabus = syllabusForId(db, id);
    const context = contextFor(c);
    if (!syllabus) return c.html(messagePage('Силлабус не найден', 'Проверьте адрес.', '/office/syllabuses', 'Все силлабусы', context), 404);
    if (c.req.method === 'GET') {
      return c.html(formulaEditor(syllabus, context, formulaForSyllabus(db, id), {}, c.req.query('saved') === '1'));
    }
    const form = c.get('form');
    const names = [...weights.map(([name]) => name), 'scale', 'rounding'];
    const values = Object.fromEntries(names.map(name => [name, typeof form[name] === 'string' ? form[name].trim() : '']));
    const errors = {};
    for (const [name] of weights) {
      if (!/^(?:100|[1-9]?\d)$/.test(values[name])) errors[name] = 'Введите целое число от 0 до 100.';
    }
    if (!Object.keys(errors).length && Number(values.current_weight) + Number(values.exam_weight) !== 100) {
      errors.exam_weight = 'Сумма весов должна быть 100%.';
    }
    if (!Object.hasOwn(scales, values.scale)) errors.scale = 'Выберите шкалу.';
    if (!Object.hasOwn(rounding, values.rounding)) errors.rounding = 'Выберите правило округления.';
    if (Object.keys(errors).length) {
      const draft = Object.fromEntries(names.map(name => [name, values[name].slice(0, 24)]));
      return c.html(formulaEditor(syllabus, context, draft, errors), 422);
    }
    saveFormula(db, id, context.staff.id, values);
    return c.redirect(`/office/syllabuses/${id}/formula?saved=1`, 303);
  };
}
