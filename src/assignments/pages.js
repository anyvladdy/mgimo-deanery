import { html } from 'hono/html';
import { formatDate, timestamp } from '../ui/format.js';
import { officeDateInput } from '../ui/date-input.js';
import { layout } from '../ui/layout.js';
import { pluralRu } from '../ui/plural.js';
import { courseKey } from './assignments.js';

const statuses = {
  assigned: ['Задано', ''],
  submitted: ['Сдано', 'is-new'],
  reviewed: ['Проверено', 'is-ready'],
  returned: ['На доработке', 'is-warning'],
};

function statusPill(value) {
  const [label, variant] = statuses[value ?? 'assigned'];
  return html`<span class="status-pill ${variant}">${label}</span>`;
}

function assignmentMeta(item, staff = false) {
  return html`<p class="hint">${item.subject}${staff ? html` · ${item.group_code}` : ''}
    · до <time datetime="${item.due_date}">${formatDate(item.due_date)}</time> включительно</p>`;
}

function assignmentList(items, staff = false) {
  const base = staff ? '/office/assignments' : '/assignments';
  return items.length ? html`<ul class="office-records" role="list">${items.map(item => html`
    <li><div>
      <h2><a class="back-link" href="${base}/${item.id}">${item.title}</a></h2>
      ${assignmentMeta(item, staff)}
    </div>
    ${staff ? html`<span class="status-pill ${item.pending ? 'is-new' : ''}">${item.pending}
      ${pluralRu(item.pending, 'работа на проверке', 'работы на проверке', 'работ на проверке')}</span>` : statusPill(item.status)}
    </li>`)}</ul>` : html`<p class="section-empty">Заданий пока нет.</p>`;
}

export function assignmentsPage(items, context) {
  return layout('Задания', html`
    <main id="content" class="page narrow academic-content">
      <header class="identity"><h1>Задания</h1></header>
      ${assignmentList(items)}
    </main>`, context);
}

function feedbackAttrs(active, id) {
  return active ? html`aria-invalid="true" aria-describedby="${id}" autofocus` : '';
}

function work(item) {
  return html`${item.text ? html`<p class="academic-prose">${item.text}</p>` : ''}
    ${item.link ? html`<a class="button-link secondary" href="${item.link}" rel="noreferrer">Открыть работу по ссылке</a>` : ''}`;
}

export function assignmentPage(item, context) {
  const { csrf, canSubmit, saved, error, field, draft } = context;
  return layout(item.title, html`
    <main id="content" class="page narrow academic-content">
      <a class="back-link" href="/assignments">Все задания</a>
      <header class="identity"><h1>${item.title}</h1>${assignmentMeta(item)}${statusPill(item.status)}</header>
      <section class="today-panel" aria-labelledby="assignment-instructions">
        <h2 id="assignment-instructions">Что нужно сделать</h2>
        <p class="academic-prose">${item.description}</p>
      </section>
      <section aria-labelledby="assignment-work">
        <h2 id="assignment-work">Ваша работа</h2>
        ${saved && item.status ? html`<p class="status-pill is-ready" role="status">Работа отправлена преподавателю</p>` : ''}
        ${item.submitted_at ? html`<p class="hint">Отправлено ${timestamp(item.submitted_at)}</p>` : ''}
        ${item.feedback ? html`<section class="today-panel">
          <h3>Комментарий преподавателя</h3><p class="academic-prose">${item.feedback}</p>
        </section>` : ''}
        ${error ? html`<p class="error" id="assignment-error" role="alert">${error}</p>` : ''}
        ${canSubmit ? html`
          <form class="form-panel" method="post" action="/assignments/${item.id}/submit">
            <input type="hidden" name="_csrf" value="${csrf}">
            <input type="hidden" name="revision" value="${item.revision ?? 0}">
            <p class="hint">Вставьте текст работы или добавьте ссылку с доступом для преподавателя.</p>
            <label for="submission-text">Текст работы</label>
            <textarea id="submission-text" name="text" rows="6" maxlength="1200"
              ${feedbackAttrs(field === 'text', 'assignment-error')}>${draft?.text ?? item.text ?? ''}</textarea>
            <label for="submission-link">Ссылка на работу</label>
            <input id="submission-link" type="url" name="link" maxlength="400" value="${draft?.link ?? item.link ?? ''}"
              ${feedbackAttrs(field === 'link', 'assignment-error')}>
            <button class="primary">${item.status ? 'Отправить новую версию' : 'Сдать работу'}</button>
          </form>` : item.status ? work(item) : html`<p class="section-empty">Приём работы закрыт.</p>`}
      </section>
    </main>`, context);
}

export function staffAssignmentsPage(items, courses, context) {
  const { csrf, key, draft = {}, error, field } = context;
  return layout('Задания и работы', html`
    <main id="content" class="page narrow academic-content">
      <header class="identity"><h1>Задания и работы</h1></header>
      <section aria-labelledby="published-assignments">
        <h2 id="published-assignments">Опубликованные задания</h2>
        ${assignmentList(items, true)}
      </section>
      <section aria-labelledby="new-assignment">
        <h2 id="new-assignment">Новое задание</h2>
        ${courses.length ? html`
          <form class="form-panel" method="post" action="/office/assignments">
            <input type="hidden" name="_csrf" value="${csrf}">
            <input type="hidden" name="key" value="${key}">
            ${error && field !== 'date' ? html`<p class="error" id="publish-assignment-error" role="alert">${error}</p>` : ''}
            <label for="assignment-course">Дисциплина и группа</label>
            <select id="assignment-course" name="course" required ${feedbackAttrs(field === 'course', 'publish-assignment-error')}>
              <option value="">Выберите дисциплину</option>
              ${courses.map(course => html`<option value="${courseKey(course)}" ${courseKey(course) === draft.course ? 'selected' : ''}>
                ${course.group_code} · ${course.subject} · ${course.assessment}</option>`)}
            </select>
            <label for="assignment-title">Название</label>
            <input id="assignment-title" name="title" required maxlength="150" value="${draft.title ?? ''}"
              ${feedbackAttrs(field === 'title', 'publish-assignment-error')}>
            <label for="assignment-description">Условия задания</label>
            <textarea id="assignment-description" name="description" required maxlength="1500" rows="6"
              ${feedbackAttrs(field === 'description', 'publish-assignment-error')}>${draft.description ?? ''}</textarea>
            ${officeDateInput('assignment-date', 'Срок сдачи', draft.date, field === 'date' ? error : '')}
            <button class="primary">Опубликовать задание</button>
          </form>`
          : html`<p class="section-empty">Доступных дисциплин пока нет.</p>`}
      </section>
    </main>`, context);
}

export function staffAssignmentPage(item, submissions, context) {
  const { csrf, saved, error, studentId, draft } = context;
  return layout(item.title, html`
    <main id="content" class="page narrow academic-content">
      <a class="back-link" href="/office/assignments">Все задания</a>
      <header class="identity"><h1>${item.title}</h1>${assignmentMeta(item, true)}</header>
      <p class="academic-prose">${item.description}</p>
      ${saved ? html`<p class="status-pill is-ready" role="status">Изменения сохранены</p>` : ''}
      <section aria-labelledby="assignment-submissions">
        <h2 id="assignment-submissions">Сданные работы</h2>
        ${submissions.length ? html`<ul class="session-assessments" role="list">${submissions.map(row => html`
          <li class="today-panel" id="submission-${row.student_id}">
            <header class="directory-title">
              <div><h3>${row.full_name}</h3><p class="hint">${timestamp(row.submitted_at)}</p></div>
              ${statusPill(row.status)}
            </header>
            ${work(row)}
            ${error && studentId === row.student_id ? html`<p class="error" id="review-work-error" role="alert">${error}</p>` : ''}
            ${row.status === 'submitted' ? html`
              <form class="form-panel" method="post" action="/office/assignments/${item.id}/submissions/${row.student_id}">
                <input type="hidden" name="_csrf" value="${csrf}">
                <input type="hidden" name="revision" value="${row.revision}">
                <label for="work-feedback-${row.student_id}">Комментарий студенту</label>
                <textarea id="work-feedback-${row.student_id}" name="feedback" maxlength="800" rows="3"
                  ${feedbackAttrs(error && studentId === row.student_id, 'review-work-error')}>${studentId === row.student_id ? draft ?? '' : ''}</textarea>
                <div class="office-buttons">
                  <button class="primary" name="status" value="reviewed">Отметить проверенной</button>
                  <button class="secondary" name="status" value="returned">Вернуть на доработку</button>
                </div>
              </form>` : row.feedback ? html`<p class="academic-prose">${row.feedback}</p>` : ''}
          </li>`)}</ul>` : html`<p class="section-empty">Студенты ещё не отправили работы.</p>`}
      </section>
    </main>`, context);
}
