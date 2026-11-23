import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';
import { gradeValues } from './gradebook.js';

const kindLabel = kind => kind === 'retake' ? 'Пересдача' : 'Основная';

function gradebookPage(title, content, context) {
  return layout(title, html`<main class="page office-page" id="content">${content}</main>`, { ...context, active: 'gradebook' });
}

export function sheetsPage({ courses, sheets }, context, error = '') {
  return gradebookPage('Ведомости', html`
    <header class="identity"><p class="eyebrow">Оценки и посещаемость</p><h1>Ведомости</h1></header>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    <div class="office-dashboard sheet-dashboard">
      <section class="office-queue">
        <h2>Новая ведомость</h2>
        ${courses.length ? html`<form class="form-panel" method="post" action="/office/gradebook">
          <input name="_csrf" type="hidden" value="${context.csrf}">
          <label for="sheet-course">Группа и дисциплина</label>
          <select id="sheet-course" name="course" required>
            <option value="">Выберите дисциплину</option>
            ${courses.map(course => html`<option value="${JSON.stringify([course.group_code, course.subject, course.assessment])}">
              ${course.group_code} · ${course.subject} · ${course.assessment}</option>`)}
          </select>
          <label for="sheet-kind">Тип ведомости</label>
          <select id="sheet-kind" name="kind"><option value="main">Основная</option><option value="retake">Пересдача</option></select>
          <button class="primary">Открыть ведомость</button>
        </form>` : html`<p>Вам пока не назначены дисциплины.</p>`}
      </section>
      <section class="office-queue">
        <h2>Созданные ведомости</h2>
        ${sheets.length ? html`<ul class="office-records" role="list">${sheets.map(sheet => html`
          <li><div><a href="/office/gradebook/${sheet.id}">${sheet.subject}</a>
            <p>${sheet.group_code} · ${sheet.assessment} · ${kindLabel(sheet.kind)}</p></div>
            <span class="status-pill${sheet.status === 'published' ? ' is-ready' : ''}">${sheet.status === 'published' ? 'Опубликована' : 'Черновик'}</span>
          </li>`)}</ul>` : html`<p class="section-empty">Созданных ведомостей пока нет.</p>`}
      </section>
    </div>`, context);
}

function recordEditor(row, sheet, csrf) {
  function option(value, label, selected) {
    return selected ? html`<option value="${value}" selected>${label}</option>`
      : html`<option value="${value}">${label}</option>`;
  }
  return html`<form class="sheet-row form-panel" id="row-${row.student_id}" method="post" action="/office/gradebook/${sheet.id}/rows/${row.student_id}">
    <input name="_csrf" type="hidden" value="${csrf}">
    <p class="sheet-student">${row.full_name}</p>
    <div><label for="presence-${row.student_id}">Явка</label>
      <select id="presence-${row.student_id}" name="attendance" required>
        <option value="">Укажите явку</option>
        ${option('present', 'Присутствовал', row.attendance === 'present')}
        ${option('absent', 'Неявка', row.attendance === 'absent')}
        ${row.canExclude || row.attendance === 'excluded'
          ? option('excluded', 'Исключён из состава', row.attendance === 'excluded') : ''}
      </select>
    </div>
    <div><label for="result-${row.student_id}">Результат</label>
      <select id="result-${row.student_id}" name="result">
        <option value="">Пока без результата</option>
        ${gradeValues(sheet.assessment).map(value => option(value, value, row.result === value))}
      </select>
    </div>
    <button class="secondary" aria-label="Сохранить · ${row.full_name}">Сохранить</button>
  </form>`;
}

export function sheetPage(sheet, context, error = '') {
  const published = sheet.status === 'published';
  const complete = sheet.rows.filter(row => ['absent', 'excluded'].includes(row.attendance) || row.result).length;
  return gradebookPage(sheet.subject, html`
    <a class="back-link" href="/office/gradebook">Все ведомости</a>
    <header class="identity directory-title">
      <div><p class="eyebrow">${sheet.group_code} · ${sheet.assessment} · ${kindLabel(sheet.kind)}</p><h1>${sheet.subject}</h1></div>
      <span class="status-pill${published ? ' is-ready' : ''}">${published ? 'Опубликована' : 'Черновик'}</span>
    </header>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    ${published ? html`
      <p>Опубликовал ${sheet.publisher} · ${formatDate(sheet.published_at)}</p>
      <dl class="plan-courses">${sheet.rows.map(row => html`
        <div><dt>${row.full_name}</dt><dd>${row.attendance === 'excluded' ? 'Исключён из состава' : row.attendance === 'absent' ? 'Неявка' : row.result}</dd></div>`)}</dl>
      <details class="plan-history"><summary>Контрольная сумма ведомости</summary><p class="review-comment">${sheet.digest}</p></details>`
      : html`
        <p>Заполнено ${complete} из ${sheet.rows.length}. При неявке результат остаётся пустым.</p>
        <div class="sheet-rows">${sheet.rows.map(row => recordEditor(row, sheet, context.csrf))}</div>
        <form class="form-panel sheet-publish" method="post" action="/office/gradebook/${sheet.id}/publish">
          <input name="_csrf" type="hidden" value="${context.csrf}">
          <button class="primary">Опубликовать оценки</button>
        </form>`}
    `, context);
}
