import { html } from 'hono/html';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { codeLifetimeMinutes } from './recovery.js';

function studentPage(title, content) {
  return layout(title, html`<main id="content" class="page narrow">
    <a class="back-link" href="/login">Ко входу</a>
    <h1>${title}</h1>
    ${content}
  </main>`);
}

function fieldAttributes(errorId, hintId) {
  const description = [hintId, errorId].filter(Boolean).join(' ');
  return html`${description ? html`aria-describedby="${description}"` : ''}
    ${errorId ? html`aria-invalid="true" autofocus` : ''}`;
}

function loginField(login, errorId = '') {
  return html`<label for="recovery-login">Логин студента</label>
    <input id="recovery-login" name="login" value="${login}" autocomplete="username" autocapitalize="none"
      spellcheck="false" maxlength="80" required
      ${fieldAttributes(errorId)}>`;
}

export function recoveryRequestPage(csrf, { login = '', error = '', sent = false } = {}) {
  if (sent) return studentPage('Запрос отправлен', html`
    <p class="request-receipt" role="status">Если логин найден, запрос передан в учебный офис.</p>
    <p>Ожидайте звонка по номеру, который вы ранее сообщили учебному офису. Если звонок не поступает, обратитесь в учебный офис лично.</p>
    <a class="button-link primary" href="/recover/complete">У меня есть код</a>`);
  return studentPage('Восстановление пароля', html`
    <p>Учебный офис позвонит по известному ему номеру. После проверки личности сотрудник сообщит решение и при подтверждении передаст код.</p>
    <form class="form-panel login-panel recovery-form" method="post" action="/recover">
      <input type="hidden" name="_csrf" value="${csrf}">
      ${error ? html`<p class="error" id="recovery-login-error" role="alert">${error}</p>` : ''}
      ${loginField(login, error ? 'recovery-login-error' : '')}
      <button class="primary">Отправить запрос</button>
    </form>
    <a class="back-link" href="/recover/complete">У меня есть код</a>`);
}

export function recoveryCodePage(csrf, { login = '', error = '', field = '', done = false } = {}) {
  if (done) return studentPage('Пароль обновлён', html`
    <p>Войдите с новым паролем.</p>
    <a class="button-link primary" href="/login">Войти</a>`);
  const errorFor = target => error && field === target ? 'recovery-code-error' : '';
  return studentPage('Новый пароль', html`
    <p>Введите логин и код, который передал сотрудник учебного офиса. Код действует ${codeLifetimeMinutes} минут.</p>
    <form class="login-panel" method="post" action="/recover/complete">
      <input type="hidden" name="_csrf" value="${csrf}">
      ${error ? html`<p class="error" id="recovery-code-error" role="alert">${error}</p>` : ''}
      ${loginField(login, errorFor('login'))}
      <label for="recovery-code">Одноразовый код</label>
      <input id="recovery-code" name="code" autocomplete="one-time-code" autocapitalize="characters"
        spellcheck="false" maxlength="40" required ${fieldAttributes(errorFor('code'))}>
      <label for="recovery-password">Новый пароль</label>
      <p class="hint" id="recovery-password-hint">От 10 до 256 символов</p>
      <input id="recovery-password" name="password" type="password" autocomplete="new-password"
        minlength="10" maxlength="256" required ${fieldAttributes(errorFor('password'), 'recovery-password-hint')}>
      <label for="recovery-confirmation">Повторите новый пароль</label>
      <input id="recovery-confirmation" name="confirmation" type="password" autocomplete="new-password"
        minlength="10" maxlength="256" required ${fieldAttributes(errorFor('confirmation'))}>
      <button class="primary">Сохранить пароль</button>
    </form>
    <a class="back-link" href="/recover">Запросить код</a>`);
}

const labels = {
  pending: 'На рассмотрении', approved: 'Код выдан', rejected: 'Отклонён',
  completed: 'Пароль обновлён', expired: 'Срок кода истёк',
};

function officePage(title, content, context) {
  return layout(title, html`<main id="content" class="page office-page">
    <a class="back-link" href="/office">Рабочий стол</a>
    <h1>${title}</h1>
    ${content}
  </main>`, { ...context, active: 'office' });
}

export function officeRecoveryPage(requests, context, error = '') {
  return officePage('Восстановление доступа', html`
    <p>Свяжитесь со студентом по известным учебному офису контактам. Перед выдачей кода подтвердите личность.</p>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    ${requests.length ? html`<ul class="office-records" role="list">
      ${requests.map(row => html`<li>
        <div>
          <a href="/office/students/${row.student_id}">${row.full_name}</a>
          <p>${row.group_code} · ${formatDate(row.created_at)}</p>
          <p>Логин · ${row.login}</p>
          ${row.reviewer ? html`<p>Рассмотрел · ${row.reviewer}</p>` : ''}
        </div>
        ${row.status === 'pending' ? html`<form class="office-buttons" method="post" action="/office/recovery/${row.id}"
          aria-label="Запрос № ${row.id} · ${row.full_name}">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          <button class="primary" name="action" value="approve">Личность проверена, выдать код</button>
          <button class="secondary" name="action" value="reject">Отклонить</button>
        </form>` : html`<span class="status-pill">${labels[row.status]}</span>`}
      </li>`)}
    </ul>` : html`<p class="section-empty">Запросов пока нет.</p>`}`, context);
}

export function recoveryCodeReceipt({ code, student }, context) {
  return officePage('Код восстановления выдан', html`
    <section class="office-queue office-detail" aria-labelledby="recovery-code-title">
      <h2 id="recovery-code-title">Одноразовый код</h2>
      <p><a href="/office/students/${student.id}">${student.full_name}</a></p>
      <p><code id="recovery-code">${code}</code></p>
      <p>Передайте код студенту во время звонка. Он показан один раз и действует ${codeLifetimeMinutes} минут.</p>
      <a class="back-link" href="/office/recovery">К запросам</a>
    </section>`, context);
}
