import { html } from 'hono/html';
import { timestamp } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { destinations } from './appeals.js';

const base = '/urgent-appeals';
const office = '/office/urgent-appeals';

function statusPill(appeal) {
  return appeal.resolved_at ? html`<span class="status-pill is-ready">Есть ответ</span>` : html`<span class="status-pill is-warning">Ожидает ответа</span>`;
}

function form(context) {
  const { choices, csrf, request, draft = {}, key, error, field } = context;
  const fieldError = name => field === name ? html`aria-invalid="true" aria-describedby="appeal-error" autofocus` : '';
  if (!choices.length) return html`<p class="section-empty">Для вашей программы пока нет доступных получателей.</p>`;
  return html`<form class="form-panel" method="post" action="${base}">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="hidden" name="key" value="${key}">
    ${request ? html`<input type="hidden" name="request" value="${request.id}">
      <p class="hint">К обращению будет привязана <a href="/requests/${request.id}">заявка № ${request.id}</a>.</p>` : ''}
    ${error ? html`<p class="error" id="appeal-error" role="alert">${error}</p>` : ''}
    <label for="appeal-recipient">Получатель</label>
    <select id="appeal-recipient" name="level" required ${fieldError('level')}>
      ${choices.map(level => html`<option value="${level}" ${draft.level === level ? 'selected' : ''}>${destinations[level]}</option>`)}
    </select>
    <label for="appeal-subject">Тема</label>
    <input id="appeal-subject" name="subject" maxlength="150" required ${fieldError('subject')}
      value="${draft.subject ?? (request ? `Заявка № ${request.id} · ${request.kind}` : '')}">
    <label for="appeal-body">Что произошло и какая помощь нужна</label>
    <textarea id="appeal-body" name="body" rows="6" maxlength="1500" required ${fieldError('body')}>${draft.body ?? ''}</textarea>
    <button class="primary">Отправить обращение</button>
  </form>`;
}

export function appealsPage(appeals, context) {
  const { staff, forwarded } = context;
  const prefix = staff ? office : base;
  const title = staff ? 'Срочные обращения' : 'Срочное обращение';
  return layout(title, html`
    <main class="page narrow academic-content" id="content">
      <header class="identity"><h1>${title}</h1>
        ${staff ? '' : html`<p>Обратитесь к руководителю программы, декану или ректору, если вопрос требует их участия.</p>`}
      </header>
      ${staff?.role === 'admin' ? html`<a class="button-link secondary" href="${office}/routing">Назначить получателей</a>` : ''}
      ${forwarded ? html`<p class="status-pill is-ready" role="status">Обращение передано следующему получателю</p>` : ''}
      ${staff ? '' : html`<section class="request-attention today-panel" aria-labelledby="new-urgent-appeal">
        <h2 id="new-urgent-appeal">Новое обращение</h2>
        ${form(context)}
      </section>`}
      <section aria-labelledby="appeal-list">
        <h2 id="appeal-list">${staff ? 'Назначенные обращения' : 'Мои обращения'}</h2>
        ${appeals.length ? html`<ul class="office-records" role="list">${appeals.map(appeal => html`
          <li><div>
            <h3><a class="back-link" href="${prefix}/${appeal.id}">${appeal.subject}</a></h3>
            <p class="hint">${appeal.full_name ? html`${appeal.full_name} · ` : ''}${destinations[appeal.level]}</p>
          </div>${statusPill(appeal)}</li>`)}</ul>` : html`<p class="section-empty">Обращений пока нет.</p>`}
      </section>
    </main>`, context);
}

export function appealPage(appeal, history, context) {
  const { staff, csrf, next, error, draft } = context;
  return layout(appeal.subject, html`
    <main class="page narrow academic-content" id="content">
      <a class="back-link" href="${staff ? office : base}">${staff ? 'Назначенные обращения' : 'Мои обращения'}</a>
      <header class="identity"><h1>${appeal.subject}</h1>${statusPill(appeal)}</header>
      <dl class="plan-courses">
        ${staff ? html`<div><dt>Студент</dt><dd>${appeal.full_name}</dd></div>` : ''}
        <div><dt>Получатель</dt><dd>${destinations[appeal.level]}</dd></div>
        <div><dt>Отправлено</dt><dd>${timestamp(appeal.created_at)}</dd></div>
        ${appeal.request_id ? html`<div><dt>Связанная заявка</dt>
          <dd>${staff ? html`№ ${appeal.request_id}` : html`<a href="/requests/${appeal.request_id}">№ ${appeal.request_id}</a>`}</dd></div>` : ''}
      </dl>
      <section class="today-panel"><h2>Текст обращения</h2><p class="academic-prose">${appeal.body}</p></section>
      ${appeal.response ? html`<section class="today-panel"><h2>Ответ</h2><p class="academic-prose">${appeal.response}</p></section>` : ''}
      ${history.length ? html`<section aria-labelledby="appeal-history"><h2 id="appeal-history">История</h2>
        <ol class="office-records" role="list">${history.map(event => html`<li><div>
          <strong>${event.kind === 'forwarded' ? 'Передано' : 'Ответ отправлен'} · ${destinations[event.level]}</strong>
          <p class="hint">${timestamp(event.occurred_at)}</p>
        </div></li>`)}</ol></section>` : ''}
      ${error ? html`<p id="appeal-action-error" class="error" role="alert">${error}</p>` : ''}
      ${staff && !appeal.resolved_at ? html`
        <section aria-labelledby="appeal-answer">
          <h2 id="appeal-answer">Ответ студенту</h2>
          <form class="form-panel" method="post" action="${office}/${appeal.id}/handle">
            <input type="hidden" name="_csrf" value="${csrf}">
            <input type="hidden" name="version" value="${appeal.version}">
            <label for="appeal-response">Текст ответа</label>
            <textarea id="appeal-response" name="response" maxlength="1500" required rows="5"
              ${error ? html`aria-describedby="appeal-action-error" autofocus` : ''}>${draft ?? ''}</textarea>
            <button class="primary" name="action" value="resolve">Отправить ответ</button>
          </form>
          ${next ? html`<form method="post" action="${office}/${appeal.id}/handle">
            <input type="hidden" name="_csrf" value="${csrf}">
            <input type="hidden" name="version" value="${appeal.version}">
            <button class="secondary" name="action" value="forward">${next === 'dean' ? 'Передать декану' : 'Передать ректору'}</button>
          </form>` : ''}
        </section>` : ''}
    </main>`, context);
}

export function routingPage({ scopes, recipients, configured, saved, error }, context) {
  return layout('Получатели обращений', html`
    <main class="page narrow academic-content" id="content">
      <a class="back-link" href="${office}">Срочные обращения</a>
      <header class="identity"><h1>Получатели обращений</h1></header>
      ${saved ? html`<p class="status-pill is-ready" role="status">Получатель назначен</p>` : ''}
      <form class="form-panel" method="post" action="${office}/routing">
        <input type="hidden" name="_csrf" value="${context.csrf}">
        ${error ? html`<p class="error" id="routing-error" role="alert">${error}</p>` : ''}
        <label for="routing-destination">Подразделение</label>
        <select id="routing-destination" name="destination" required ${error ? html`aria-describedby="routing-error" autofocus` : ''}>
          ${scopes.map(([level, scope]) => html`<option value="${JSON.stringify([level, scope])}">
            ${destinations[level]}${scope ? ` · ${scope}` : ''}</option>`)}
        </select>
        <label for="routing-recipient">Получатель</label>
        <select id="routing-recipient" name="recipient" required>
          <option value="">Выберите получателя</option>
          ${recipients.map(staff => html`<option value="${staff.id}">${staff.full_name}</option>`)}
        </select>
        <button class="primary">Назначить получателя</button>
      </form>
      <section aria-labelledby="active-routing">
        <h2 id="active-routing">Текущие назначения</h2>
        ${configured.length ? html`<ul class="office-records" role="list">${configured.map(row => html`<li><div>
          <strong>${destinations[row.level]}${row.scope ? ` · ${row.scope}` : ''}</strong>
          <p>${row.full_name}${row.active && ['leadership', 'office', 'admin'].includes(row.role) ? '' : ' · Недоступен'}</p>
        </div></li>`)}</ul>` : html`<p class="section-empty">Получатели ещё не назначены.</p>`}
      </section>
    </main>`, context);
}
