import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';
import { initialStatus, waitingStatus, clarificationLimit, readyStatus, approvedStatus, rejectedStatus, postponementKind } from './requests.js';

function requestProgress(status) {
  if (status !== initialStatus && status !== readyStatus) {
    return html`<p>Статус заявки · <strong>${status}</strong></p>`;
  }
  const ready = status === readyStatus;
  return html`
    <section class="request-progress" aria-labelledby="progress-title">
      <h2 id="progress-title">Ход заявки</h2>
      <ol class="request-steps" role="list">
        ${ready
          ? html`<li class="is-complete"><strong>Принята</strong><span>Выполнено</span></li>
                 <li aria-current="step"><strong>Готова</strong><span>Текущий этап</span></li>`
          : html`<li aria-current="step"><strong>Принята</strong><span>Текущий этап</span></li>
                 <li><strong>Готова</strong><span>Ожидается</span></li>`}
      </ol>
      <p>${ready
        ? 'Справку можно получить в деканате.'
        : 'Деканат готовит справку. Когда её можно будет забрать, здесь появится статус «Готова».'}</p>
    </section>`;
}

function postponementProgress(request) {
  const reviewed = request.status === approvedStatus || request.status === rejectedStatus;
  return html`<section class="request-progress" aria-labelledby="progress-title">
    <h2 id="progress-title">Ход заявления</h2>
    <p><strong class="status-pill${request.status === approvedStatus ? ' is-ready' : request.status === rejectedStatus ? ' is-warning' : ''}">${request.status}</strong></p>
    <p>${reviewed
      ? request.status === approvedStatus
        ? html`Дисциплина перенесена на следующий учебный год. <a href="/plan#postponed">Открыть учебный план</a>.`
        : 'Учебный офис отклонил перенос.'
      : 'Заявление рассматривает учебный офис. Решение появится здесь.'}</p>
    ${request.comment ? html`<p class="review-comment">${request.comment}</p>` : ''}
    ${request.reviewed_at ? html`<p class="hint">Решение от ${formatDate(request.reviewed_at)}</p>` : ''}
  </section>`;
}

export function requestsPage(requests, available, csrf, student, error = '') {
  const waiting = requests.filter(request => request.status === waitingStatus);
  const submitted = requests.filter(request => request.status !== waitingStatus);
  return layout('Мои заявки', html`
    <main id="content" class="page requests">
      <header class="identity requests-heading">
        <h1>Мои заявки</h1>
        ${requests.length ? html`<a href="#new-request">Подать заявку</a>` : ''}
      </header>
      ${waiting.length ? html`<section class="request-progress request-attention" aria-labelledby="request-attention-title">
        <h2 id="request-attention-title">${waitingStatus}</h2>
        <ul role="list">
          ${waiting.map(request => html`<li>
            <div>
              <p class="request-subject">${request.subject ?? request.kind}</p>
              <p class="hint">Заявка № ${request.id} · ${formatDate(request.created_at)}</p>
            </div>
            <a class="button-link primary" href="/requests/${request.id}#clarification" aria-label="Ответить на вопрос по заявке № ${request.id}">Ответить на вопрос</a>
          </li>`)}
        </ul>
      </section>` : ''}
      ${submitted.length ? html`
        <h2>${waiting.length ? 'Другие заявки' : 'Поданные заявки'}</h2>
        <dl class="request-list">${submitted.map(request => html`
            <div>
              <dt><a href="/requests/${request.id}">${request.subject ?? request.kind}</a>
                <span class="request-number">№ ${request.id}</span></dt>
              <dd><span class="status-pill${[readyStatus, approvedStatus].includes(request.status) ? ' is-ready' : request.status === rejectedStatus ? ' is-warning' : ''}">${request.status}</span>
                <span>${formatDate(request.created_at)}</span></dd>
            </div>`)}
        </dl>` : ''}
      <section id="new-request" class="request-target" aria-labelledby="new-request-title" tabindex="-1">
        <h2 id="new-request-title">Новая заявка</h2>
        <div class="request-actions">
          <section>
            <h3>Получить справку</h3>
            <p>Когда справка будет готова, её можно забрать в деканате.</p>
            <form method="post" action="/requests">
              <input type="hidden" name="_csrf" value="${csrf}">
              <button class="primary">Запросить справку</button>
            </form>
          </section>
          <section>
            <h3>Перенос дисциплины</h3>
            <p>Заявление о переносе обязательной дисциплины на следующий учебный год.</p>
            ${available.length ? html`<form method="post" action="/requests/postpone">
              <input type="hidden" name="_csrf" value="${csrf}">
              <label for="postpone-course">Дисциплина без результата</label>
              ${error ? html`<p class="error" id="postpone-error">${error}</p>` : ''}
              <select name="course" id="postpone-course" required${error ? html` aria-invalid="true" aria-describedby="postpone-error" autofocus` : ''}>
                <option value="">Выберите дисциплину</option>
                ${available.map(course => html`<option value="${JSON.stringify([course.subject, course.assessment])}">
                  ${course.subject} · ${course.assessment}
                </option>`)}
              </select>
              <button class="secondary">Подать заявление</button>
            </form>` : html`
              ${error ? html`<p class="error" role="alert" tabindex="-1" autofocus>${error}</p>` : ''}
              <p class="hint">Сейчас нет дисциплин, доступных для переноса.</p>
            `}
          </section>
        </div>
      </section>
      ${!requests.length ? html`<section aria-labelledby="submitted-requests-title">
        <h2 id="submitted-requests-title">Поданные заявки</h2>
        <p class="section-empty">Заявок пока нет.</p>
      </section>` : ''}
    </main>`, { student, csrf, active: 'requests' });
}

export function clarificationHistory(cycles) {
  return cycles.length ? html`
    <section class="request-progress" aria-labelledby="clarification-history-title">
      <h2 id="clarification-history-title">История уточнений</h2>
      <dl>
        ${cycles.map(cycle => html`
          <div>
            <dt>Вопрос от ${formatDate(cycle.asked_at)}${cycle.author ? html` · ${cycle.author}` : ''}</dt>
            <dd class="review-comment">${cycle.question}</dd>
          </div>
          <div>
            <dt>${cycle.answered_at ? html`Ответ от ${formatDate(cycle.answered_at)}` : 'Ответ'}</dt>
            <dd class="review-comment">${cycle.answer ?? 'Ожидается'}</dd>
          </div>`)}
      </dl>
    </section>` : '';
}

export function requestPage(request, csrf, student, feedback = null) {
  const postponement = request.kind === postponementKind;
  const waiting = request.status === waitingStatus;
  const current = waiting ? request.clarifications.at(-1) : null;
  const history = current ? request.clarifications.slice(0, -1) : request.clarifications;
  const fieldError = current && feedback?.kind === 'invalid' ? feedback.message : '';
  return layout(request.kind, html`
    <main id="content" class="page request">
      <header class="identity">
        <p class="eyebrow">${postponement ? request.kind : 'Справка'}</p>
        <h1>${request.subject ?? request.kind}</h1>
      </header>
      ${feedback && !fieldError ? html`<p class="error" role="alert" tabindex="-1" autofocus>${feedback.message}</p>` : ''}
      ${request.status === initialStatus && history.length ? html`<p class="request-receipt"><strong>Ответ передан в учебный офис.</strong> Заявка снова на рассмотрении.</p>` : ''}
      ${current ? html`
        <section id="clarification" class="request-progress request-attention request-target" aria-labelledby="clarification-title" tabindex="-1">
          <h2 id="clarification-title">${waitingStatus}</h2>
          <p>Ответьте на вопрос учебного офиса, чтобы он продолжил рассмотрение заявки.</p>
          <blockquote class="review-comment">${current.question}</blockquote>
          <form class="form-panel" method="post" action="/requests/${request.id}/clarifications/${current.id}/answer">
            <input type="hidden" name="_csrf" value="${csrf}">
            <label for="clarification-answer">Ваш ответ</label>
            ${fieldError ? html`<p class="error" id="clarification-error">${fieldError}</p>` : ''}
            <textarea id="clarification-answer" name="answer" rows="4" maxlength="${clarificationLimit}" required${fieldError ? html` aria-invalid="true" aria-describedby="clarification-error" autofocus` : ''}>${feedback?.answer ?? ''}</textarea>
            <button class="primary">Отправить ответ</button>
          </form>
        </section>`
        : postponement ? postponementProgress(request) : requestProgress(request.status)}
      ${clarificationHistory(history)}
      <dl>
        <div><dt>Номер заявки</dt><dd>${request.id}</dd></div>
        <div><dt>Дата подачи</dt><dd>${formatDate(request.created_at)}</dd></div>
      </dl>
      <p><a href="/requests">К моим заявкам</a></p>
    </main>`, { student, csrf, active: 'requests' });
}
