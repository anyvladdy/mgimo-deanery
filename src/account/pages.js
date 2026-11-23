import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

export function loginPage(csrf, { login = '', error = '', recovery = false, studyTools = true } = {}) {
  return layout('Вход', html`
    <main id="content" class="page login">
      <header class="login-intro">
        <h1>Вход в кабинет</h1>
        <p>Введите логин и пароль.${studyTools ? ' В кабинете доступны расписание, оценки и заявки.' : ''}</p>
      </header>
      <form class="login-panel" method="post" action="/login" aria-label="Вход студента">
        <input type="hidden" name="_csrf" value="${csrf}">
        <label for="login">Логин</label>
        <input name="login" id="login" autocomplete="username" autocapitalize="none" spellcheck="false"
               required maxlength="80" value="${login}"
               ${error ? html`aria-invalid="true" aria-describedby="login-error"` : ''}>
        <label for="password">Пароль</label>
        <input type="password" name="password" id="password" required maxlength="256" autocomplete="current-password"
               ${error ? html`aria-invalid="true" aria-describedby="login-error" autofocus` : ''}>
        ${error ? html`<p class="error" id="login-error" role="alert">${error}</p>` : ''}
        <button class="primary">Войти</button>
        ${recovery ? html`<a class="back-link" href="/recover">Забыли пароль?</a>` : ''}
      </form>
    </main>`);
}

export function profilePage(student, csrf, history = '', actions = []) {
  const details = [
    ['Группа', student.group_code], ['Курс', student.year],
    ['Факультет', student.faculty], ['Направление', student.program],
  ];
  return layout('Мой профиль', html`
    <main id="content" class="page profile">
      <header class="identity">
        <p class="eyebrow">Профиль</p>
        <h1>${student.full_name}</h1>
      </header>
      <dl>${details.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>
      ${actions.length ? html`<nav class="section-links" aria-label="Сервисы профиля">
        ${actions.map(([href, label]) => html`<a href="${href}">${label}</a>`)}
      </nav>` : ''}
      ${history}
    </main>`, { student, csrf, active: 'profile' });
}
