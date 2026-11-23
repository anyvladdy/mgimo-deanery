import { html } from 'hono/html';

function navLink(href, label, key, active) {
  if (key === active) {
    return html`<a class="nav-link is-active" href="${href}" aria-current="page">${label}</a>`;
  }
  return html`<a class="nav-link" href="${href}">${label}</a>`;
}

function profileLink(student, active) {
  if (active === 'profile') {
    return html`<a class="account-name is-active" href="/profile" aria-current="page">${student.full_name}</a>`;
  }
  return html`<a class="account-name" href="/profile">${student.full_name}</a>`;
}

function masthead(student, csrf, active) {
  return html`
    <header class="mast">
      <a class="brand" href="${student ? '/' : '/login'}">Деканат</a>
      ${student
        ? html`<nav class="main-nav" aria-label="Разделы кабинета">
            ${navLink('/', 'Сегодня', 'today', active)}
            ${navLink('/schedule', 'Расписание', 'schedule', active)}
            ${navLink('/grades', 'Ведомость', 'grades', active)}
            ${navLink('/requests', 'Справки', 'requests', active)}
          </nav>
          <div class="account">
            ${profileLink(student, active)}
            <form method="post" action="/logout">
              <input type="hidden" name="_csrf" value="${csrf}">
              <button class="quiet-button">Выйти</button>
            </form>
          </div>`
        : html`<span class="tagline">Личный кабинет студента</span>`}
    </header>`;
}

export function layout(title, content, { student = null, csrf = '', active = '' } = {}) {
  return html`<!doctype html>
    <html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} · Деканат</title><link rel="stylesheet" href="/assets/site.css"></head>
    <body><a class="skip" href="#content">К содержанию</a>
      ${masthead(student, csrf, active)}
      ${content}
      <footer class="site-footer">Деканат · Личный кабинет студента</footer>
    </body></html>`;
}

export function messagePage(title, message, href = '/login', action = 'Вернуться ко входу', options = {}) {
  return layout(title, html`<main class="page narrow" id="content"><h1>${title}</h1><p>${message}</p>
    <a href="${href}">${action}</a></main>`, options);
}
