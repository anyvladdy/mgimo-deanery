import { html } from 'hono/html';

function navLink(href, label, key, active) {
  if (key === active) {
    return html`<a class="nav-link is-active" href="${href}" aria-current="page">${label}</a>`;
  }
  return html`<a class="nav-link" href="${href}">${label}</a>`;
}

function profileLink(student, active) {
  if (active === 'profile') {
    return html`<a class="account-name is-active" href="/profile" aria-current="page" aria-label="Профиль · ${student.full_name}">${student.full_name}</a>`;
  }
  return html`<a class="account-name" href="/profile" aria-label="Профиль · ${student.full_name}">${student.full_name}</a>`;
}

function masthead(student, staff, csrf, active, staffMode) {
  if (staff) {
    const teacher = staff.role === 'teacher';
    return html`<header class="mast office-mast">
      <a class="brand" href="/office">Деканат <span>${teacher ? 'Кабинет преподавателя' : 'Учебный офис'}</span></a>
      <nav class="main-nav" aria-label="Рабочие разделы">
        ${teacher ? '' : html`
          ${navLink('/office', 'Рабочий стол', 'office', active)}
          ${navLink('/office/requests', 'Заявки', 'office-requests', active)}
          ${navLink('/office/students', 'Студенты', 'office-students', active === 'office-registry' ? 'office-students' : active)}
          ${navLink('/office/curriculum', 'Учебные планы', 'curriculum', active)}
          ${navLink('/office/syllabuses', 'Силлабусы', 'office-syllabuses', active)}`}
        ${navLink('/office/gradebook', 'Ведомости', 'gradebook', active)}
      </nav>
      <div class="account">
        <span class="account-name">${staff.full_name}</span>
        <form method="post" action="/office/logout">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="quiet-button">Выйти</button>
        </form>
      </div>
    </header>`;
  }
  if (student) {
    return html`<header class="mast student-mast">
      <div class="mast-identity">
        <a class="brand" href="/">Деканат</a>
        <div class="account">
          ${profileLink(student, active)}
          <form method="post" action="/logout">
            <input type="hidden" name="_csrf" value="${csrf}">
            <button class="quiet-button">Выйти</button>
          </form>
        </div>
      </div>
      <div class="student-navigation">
        <nav class="main-nav" aria-label="Основные разделы">
          ${navLink('/', 'Сегодня', 'today', active)}
          ${navLink('/schedule', 'Расписание', 'schedule', active)}
          ${navLink('/grades', 'Ведомость', 'grades', active)}
          ${navLink('/requests', 'Заявки', 'requests', active)}
        </nav>
        <nav class="student-tools" aria-label="Учёба и уведомления">
          ${navLink('/plan', 'Учебный план', 'plan', active)}
          ${navLink('/notices', 'Уведомления', 'notices', active)}
        </nav>
      </div>
    </header>`;
  }
  return html`<header class="mast">
    <a class="brand" href="${staffMode ? '/office/login' : '/login'}">Деканат</a>
    <a class="tagline" href="${staffMode ? '/login' : '/office/login'}">${staffMode ? 'Вход для студента' : 'Вход для сотрудника'}</a>
  </header>`;
}

export function layout(title, content, { student = null, staff = null, csrf = '', active = '', staffMode = false } = {}) {
  return html`<!doctype html>
    <html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} · Деканат</title><link rel="stylesheet" href="/assets/site.css"></head>
    <body><a class="skip" href="#content">К содержанию</a>
      ${masthead(student, staff, csrf, active, staffMode)}
      <p class="prototype-note">Конкурсный прототип цифрового деканата</p>
      ${content}
      <footer class="site-footer">Деканат · ${staff?.role === 'teacher' ? 'Кабинет преподавателя' : staff || staffMode ? 'Учебный офис' : 'Личный кабинет студента'}</footer>
    </body></html>`;
}

export function messagePage(title, message, href = '/login', action = 'Вернуться ко входу', options = {}) {
  return layout(title, html`<main class="page narrow" id="content"><h1>${title}</h1><p>${message}</p>
    <a href="${href}">${action}</a></main>`, options);
}
