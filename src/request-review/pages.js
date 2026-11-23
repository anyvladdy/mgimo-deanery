import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate, timestamp } from '../ui/format.js';

function status(value, { readyStatus, approvedStatus, rejectedStatus, waitingStatus }) {
  return html`<span class="status-pill${[readyStatus, approvedStatus].includes(value) ? ' is-ready' : [rejectedStatus, waitingStatus].includes(value) ? ' is-warning' : ''}">${value}</span>`;
}

function officePage(title, content, context, active) {
  return layout(title, html`<main class="page office-page" id="content">${content}</main>`, { ...context, active });
}

export function inboxRows(rows, empty, requests) {
  return rows.length ? html`<ul class="office-records" role="list">${rows.map(request => html`
    <li><div>
      <a href="/office/requests/${request.id}">${request.subject ?? request.kind}</a>
      <p>${request.full_name} · ${request.group_code} · ${formatDate(request.created_at)}</p>
    </div>${status(request.status, requests)}</li>`)}</ul>`
    : html`<p class="section-empty">${empty}</p>`;
}

export function officeInbox(rows, view, context, requests) {
  const empty = {
    pending: 'Нет заявок на рассмотрении.',
    waiting: 'Нет заявок, ожидающих ответа студента.',
    closed: 'Обработанных заявок пока нет.',
  };
  return officePage('Заявки студентов', html`
    <header class="identity"><p class="eyebrow">Учебный офис</p><h1>Заявки студентов</h1></header>
    <nav class="section-links" aria-label="Статус заявки">
      <a href="/office/requests" aria-current="${view === 'pending' ? 'page' : 'false'}">На рассмотрении</a>
      <a href="/office/requests?view=waiting" aria-current="${view === 'waiting' ? 'page' : 'false'}">Ждут ответа студента</a>
      <a href="/office/requests?view=closed" aria-current="${view === 'closed' ? 'page' : 'false'}">Обработанные</a>
    </nav>
    ${inboxRows(rows, empty[view], requests)}`, context, 'office-requests');
}

export function officeRequestPage(request, context, requests, error = '', comment = '', question = '') {
  const { certificateKind, initialStatus, postponementKind, waitingStatus, clarificationLimit, clarificationHistory } = requests;
  const actionable = request.status === initialStatus && [certificateKind, postponementKind].includes(request.kind);
  const cycle = request.clarifications.at(-1)?.id ?? 0;
  return officePage(request.kind, html`
    <div class="office-detail">
      <a class="back-link" href="/office/requests">Все заявки</a>
      <header class="identity"><p class="eyebrow">Заявка № ${request.id}</p><h1>${request.kind}</h1></header>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
      <dl>
        <div><dt>Студент</dt><dd><a href="/office/students/${request.student_id}">${request.full_name}</a> · ${request.group_code}</dd></div>
        <div><dt>Дата подачи</dt><dd>${timestamp(request.created_at)}</dd></div>
        ${request.subject ? html`<div><dt>Дисциплина</dt><dd>${request.subject} · ${request.assessment}</dd></div>` : ''}
        <div><dt>Статус</dt><dd>${status(request.status, requests)}</dd></div>
        ${request.reviewer ? html`<div><dt>Кто рассмотрел</dt><dd>${request.reviewer} · ${formatDate(request.reviewed_at)}</dd></div>` : ''}
        ${request.comment ? html`<div><dt>Комментарий</dt><dd class="review-comment">${request.comment}</dd></div>` : ''}
      </dl>
      ${request.status === waitingStatus ? html`<p>Дождитесь ответа студента, чтобы вынести решение.</p>` : ''}
      ${clarificationHistory(request.clarifications)}
      ${actionable ? html`
        <section class="office-queue">
          <h2>Запросить уточнение</h2>
          <form class="form-panel" method="post" action="/office/requests/${request.id}/clarify">
            <input type="hidden" name="_csrf" value="${context.csrf}">
            <input type="hidden" name="cycle" value="${cycle}">
            <label for="clarification-question">Вопрос студенту</label>
            <textarea id="clarification-question" name="question" rows="4" maxlength="${clarificationLimit}" required>${question}</textarea>
            <button class="secondary">Отправить вопрос</button>
          </form>
        </section>
        <section class="office-queue">
          <h2>Решение</h2>
          <form class="form-panel" method="post" action="/office/requests/${request.id}/review">
            <input type="hidden" name="_csrf" value="${context.csrf}">
            <input type="hidden" name="cycle" value="${cycle}">
            ${request.kind === certificateKind
              ? html`<p>Студент увидит, что справка готова к выдаче.</p>
                <button class="primary" name="action" value="ready">Отметить готовой</button>`
              : html`
                <label for="review-comment">Комментарий к решению</label>
                <p class="hint" id="decision-hint">При отказе укажите причину. Студент увидит её в кабинете.</p>
                <textarea name="comment" id="review-comment" maxlength="500" rows="3" aria-describedby="decision-hint">${comment}</textarea>
                <div class="office-buttons">
                  <button class="primary" name="action" value="approve">Одобрить перенос</button>
                  <button class="secondary" name="action" value="reject">Отклонить</button>
                </div>`}
          </form>
        </section>` : ''}
    </div>`, context, 'office-requests');
}
