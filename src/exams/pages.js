import { html } from 'hono/html';
import { officeDateInput } from '../ui/date-input.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { examKey } from './exams.js';

function examPreview(selected, draft, version, csrf) {
  return html`<section class="exam-editor office-queue" aria-labelledby="exam-preview-title">
    <h2 id="exam-preview-title" tabindex="-1" autofocus>Проверка перед публикацией</h2>
    <dl>
      <div><dt>Дисциплина и группа</dt><dd>${selected.subject} · ${selected.group_code}</dd></div>
      <div><dt>Дата и время</dt><dd><time datetime="${draft.exam_date}">${formatDate(draft.exam_date)}</time> ·
        <time datetime="${draft.starts_at}">${draft.starts_at}</time> МСК</dd></div>
      <div><dt>Корпус и аудитория</dt><dd>${draft.building} · ауд. ${draft.room}</dd></div>
    </dl>
    <form method="post" action="/office/exams" class="office-buttons">
      <input type="hidden" name="_csrf" value="${csrf}">
      <input type="hidden" name="exam" value="${examKey(selected)}">
      <input type="hidden" name="version" value="${version}">
      <input type="hidden" name="date" value="${draft.exam_date}">
      <input type="hidden" name="time" value="${draft.starts_at}">
      <input type="hidden" name="building" value="${draft.building}">
      <input type="hidden" name="room" value="${draft.room}">
      <button class="primary" name="action" value="publish">${version ? 'Опубликовать изменение' : 'Опубликовать экзамен'}</button>
      <button class="secondary" name="action" value="edit">Вернуться к редактированию</button>
    </form>
  </section>`;
}

export function examEditor(exams, selected, draft, version, { staff, csrf }, { error = '', dateError = '', saved = false, preview = false } = {}) {
  return layout('Расписание экзаменов', html`
    <main id="content" class="page narrow office-page">
      <a class="back-link" href="/office">К рабочему столу</a>
      <header class="identity"><h1>Расписание экзаменов</h1></header>
      ${saved ? html`<p class="status-pill is-ready" role="status">Расписание опубликовано</p>` : ''}
      ${error ? html`<p class="error" role="alert" tabindex="-1" autofocus>${error}</p>` : ''}
      ${exams.length ? html`
        <form method="get" action="/office/exams" class="form-panel">
          <label for="exam-choice">Группа и дисциплина</label>
          <select id="exam-choice" name="exam" required>
            <option value="">Выберите экзамен</option>
            ${exams.map(exam => selected && examKey(exam) === examKey(selected)
              ? html`<option selected value="${examKey(exam)}">${exam.group_code} · ${exam.subject}</option>`
              : html`<option value="${examKey(exam)}">${exam.group_code} · ${exam.subject}</option>`)}
          </select>
          <button class="secondary">Открыть экзамен</button>
        </form>` : html`<p class="section-empty">Экзаменов в ожидании результата пока нет.</p>`}
      ${selected ? (preview ? examPreview(selected, draft, version, csrf) : html`
        <section class="exam-editor" aria-labelledby="exam-edit-title">
          <h2 id="exam-edit-title">${selected.subject} · ${selected.group_code}</h2>
          <form method="post" action="/office/exams" class="form-panel">
            <input type="hidden" name="_csrf" value="${csrf}">
            <input type="hidden" name="exam" value="${examKey(selected)}">
            <input type="hidden" name="version" value="${version}">
            ${officeDateInput('exam-date', 'Дата экзамена', draft.exam_date, dateError)}
            <label for="exam-time">Время начала (МСК)</label>
            <input id="exam-time" type="time" name="time" value="${draft.starts_at ?? ''}" required>
            <label for="exam-building">Корпус</label>
            <input id="exam-building" name="building" maxlength="100" value="${draft.building ?? ''}" required>
            <label for="exam-room">Аудитория</label>
            <input id="exam-room" name="room" maxlength="32" value="${draft.room ?? ''}" required>
            <button class="primary" name="action" value="preview">Проверить перед публикацией</button>
          </form>
        </section>`) : ''}
    </main>`, { staff, csrf });
}
