import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

function profileOption(profile, selected) {
  const name = html`<span class="profile-name">${profile.full_name}</span>
    <span class="profile-meta">${profile.program} · ${profile.group_code} · ${profile.login}</span>`;
  if (profile.login === selected?.login) {
    return html`<a class="profile-option is-selected" href="/login?as=${encodeURIComponent(profile.login)}" aria-current="true">
      ${name}<span class="profile-mark">Выбран</span>
    </a>`;
  }
  return html`<a class="profile-option" href="/login?as=${encodeURIComponent(profile.login)}">${name}</a>`;
}

export function loginPage(csrf, { profiles = [], selected = null, login = '', error = '' } = {}) {
  const firstName = selected ? selected.full_name.split(' ')[0] : '';
  const intro = profiles.length
    ? 'Выберите свой профиль и введите пароль. В кабинете подготовлены Мира и Марк; для другого аккаунта используйте форму ниже.'
    : 'Введите логин и пароль, чтобы открыть кабинет.';
  const otherForm = html`<form method="post" action="/login">
    <input type="hidden" name="_csrf" value="${csrf}">
    <label for="login">Логин</label>
    <input name="login" id="login" autocomplete="username" autocapitalize="none" spellcheck="false"
           required maxlength="80" value="${login}">
    <label for="password">Пароль</label>
    <input type="password" name="password" id="password" required maxlength="256" autocomplete="current-password">
    <button class="secondary">Войти</button>
  </form>`;
  return layout('Вход', html`
    <main id="content" class="page login">
      <section class="login-intro">
        <p class="eyebrow">Личный кабинет</p>
        <h1>Вход в кабинет</h1>
        <p>${intro}</p>
      </section>
      <section class="login-panel" aria-labelledby="login-title">
        <h2 id="login-title">${profiles.length ? 'Профиль' : 'Вход'}</h2>
        ${profiles.length
          ? html`<p class="hint">Сначала выберите себя — кнопка входа покажет имя.</p>
              <div class="profile-choice">${profiles.map(profile => profileOption(profile, selected))}</div>`
          : html`<p class="hint">Подготовленные профили не включены. Войдите по логину и паролю.</p>`}
        ${error ? html`<p class="error" id="login-error" role="alert">${error}</p>` : ''}
        ${selected
          ? html`<form method="post" action="/login">
              <input type="hidden" name="_csrf" value="${csrf}">
              <input type="hidden" name="login" value="${selected.login}">
              <label for="profile-password">Пароль</label>
              <input type="password" name="password" id="profile-password" required maxlength="256" autocomplete="current-password">
              <button class="primary">Войти как ${firstName}</button>
            </form>`
          : ''}
        ${profiles.length
          ? html`<div class="other-login">
              <h2>Другой аккаунт</h2>
              ${otherForm}
            </div>`
          : otherForm}
      </section>
    </main>`);
}

export function profilePage(student, csrf) {
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
    </main>`, { student, csrf, active: 'profile' });
}
