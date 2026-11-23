import { AsyncLocalStorage } from 'node:async_hooks';
import { html } from 'hono/html';
import { designLoaderIntegrity, designLoaderUrl, fullStylesheetUrl, presentationControl, presentationVariant, studentNavigation } from './presentation.js';

const requestModules = new AsyncLocalStorage();
const requestTheme = new AsyncLocalStorage();
const portalName = 'Личный кабинет';
export const homeTitle = 'Ближайшие занятия';
const todayLink = ['/', homeTitle, 'today', 'week'];
const profileItem = ['/profile', 'Профиль', 'profile'];
const servicesItem = ['/services', 'Сервисы', 'services'];
const officeLink = ['/office', 'Рабочий стол', 'office'];

export function withModules(modules, render) {
  return requestModules.run(modules, render);
}

export function withTheme(theme, render) {
  return requestTheme.run(theme, render);
}

function navLink(href, label, key, active) {
  if (key === active) {
    return html`<a class="nav-link is-active" href="${href}" aria-current="page">${label}</a>`;
  }
  return html`<a class="nav-link" href="${href}">${label}</a>`;
}

const navItems = (items, active) => items.map(([href, label, key]) => navLink(href, label, key, active));

function mobileNavigation(items, active, { shortcut, label = 'Разделы' } = {}) {
  if (!items.length) return '';
  if (items.length === 1) {
    return html`<nav class="mobile-navigation" aria-label="${label}">${navItems(items, active)}</nav>`;
  }
  const selected = items.find(item => item[2] === active)?.[1];
  return html`<div class="mobile-navigation">
    ${shortcut ? navLink(shortcut[0], shortcut[1], shortcut[2], active) : ''}
    <details class="section-menu">
      <summary><span>${label}</span>${selected && shortcut?.[2] !== active ? html`<span class="section-menu-current">${selected}</span>` : ''}</summary>
      <nav aria-label="${label}">${navItems(items.filter(item => item !== shortcut), active)}</nav>
    </details>
  </div>`;
}

function profileLink(student, active) {
  if (active === 'profile') {
    return html`<a class="account-name is-active" href="/profile" aria-current="page" aria-label="Профиль · ${student.full_name}">${student.full_name}</a>`;
  }
  return html`<a class="account-name" href="/profile" aria-label="Профиль · ${student.full_name}">${student.full_name}</a>`;
}

function masthead(student, staff, csrf, active, staffMode) {
  const modules = requestModules.getStore();
  const itemsFor = group => modules?.navigation(group) ?? [];
  if (staff) {
    const teacher = staff.role === 'teacher';
    const leadership = staff.role === 'leadership';
    const staffTools = itemsFor('staffTools');
    const items = teacher
      ? (staffTools.length ? staffTools : [officeLink])
      : leadership ? itemsFor('leadershipTools')
        : [officeLink, ...itemsFor('officeMain'), ...staffTools];
    const section = active === 'office-registry' ? 'office-students' : active;
    return html`<header class="mast office-mast">
      <a class="brand" href="/office">${portalName} <span>${teacher ? 'Кабинет преподавателя' : leadership ? 'Кабинет руководителя' : 'Учебный офис'}</span></a>
      <nav class="main-nav" aria-label="Рабочие разделы">${navItems(items, section)}</nav>
      <div class="account">
        <span class="account-name">${staff.full_name}</span>
        <form method="post" action="/office/logout">
          <input type="hidden" name="_csrf" value="${csrf}">
          <button class="quiet-button">Выйти</button>
        </form>
      </div>
      ${mobileNavigation(items, section)}
    </header>`;
  }
  if (student) {
    const theme = requestTheme.getStore();
    const themeControl = theme ? modules?.get('theme')?.themeSwitch(theme, csrf) : '';
    const studentMain = [todayLink, ...itemsFor('studentMain')];
    const studentTools = itemsFor('studentTools');
    const fullHeader = presentationVariant() === 'lite' ? [] : itemsFor('studentHeader');
    const services = itemsFor('studentServices');
    if (services.length) studentTools.push(servicesItem);
    const current = services.some(item => item[2] === active) ? 'services' : active;
    return html`<header class="mast student-mast">
      <div class="mast-identity">
        <a class="brand" href="/">${portalName}</a>
        <div class="account">
          ${fullHeader.length ? html`<nav class="design-header-tools" aria-label="Быстрый доступ" hidden>
            ${navItems(fullHeader, active)}
          </nav>` : ''}
          ${profileLink(student, active)}
          ${themeControl}
          <form method="post" action="/logout">
            <input type="hidden" name="_csrf" value="${csrf}">
            <button class="quiet-button">Выйти</button>
          </form>
        </div>
      </div>
      <div class="student-navigation">
        <nav class="main-nav" aria-label="Основные разделы">${navItems(studentMain, active)}</nav>
        ${studentTools.length ? html`<nav class="student-tools" aria-label="Учёба и уведомления">${navItems(studentTools, current)}</nav>` : ''}
      </div>
      ${mobileNavigation([...studentMain, ...studentTools, profileItem], current, { shortcut: studentMain.find(item => item[2] === 'schedule') })}
    </header>
    ${studentNavigation({ items: [...studentMain, ...studentTools, ...itemsFor('studentFullTools')], active: current })}`;
  }
  const forStaff = staffMode && modules?.has('office');
  return html`<header class="mast">
    <a class="brand" href="${forStaff ? '/office/login' : '/login'}">${portalName}</a>
    ${modules?.has('office') ? html`<a class="tagline" href="${forStaff ? '/login' : '/office/login'}">${forStaff ? 'Вход для студента' : 'Вход для сотрудника'}</a>` : ''}
  </header>`;
}

export function layout(title, content, { student = null, staff = null, csrf = '', active = '', staffMode = false, prototypeInFooter = false } = {}) {
  const prototypeNote = html`<p class="prototype-note">Конкурсный прототип цифрового деканата</p>`;
  const theme = requestTheme.getStore();
  const design = presentationVariant();
  return html`<!doctype html>
    <html lang="ru"${theme?.theme === 'dark' ? html` data-theme="dark"` : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} · ${portalName}</title><link rel="stylesheet" href="/assets/site.css">
      ${theme ? html`<link rel="stylesheet" href="/assets/theme.css">` : ''}
      ${design === 'full' ? html`<link rel="stylesheet" href="${fullStylesheetUrl}" media="screen">` : ''}
      ${design === 'auto' ? html`<script src="${designLoaderUrl}" integrity="${designLoaderIntegrity}" data-stylesheet="${fullStylesheetUrl}" defer></script>` : ''}</head>
    <body><a class="skip" href="#content">К содержанию</a>
      ${masthead(student, staff, csrf, active, staffMode)}
      ${prototypeInFooter ? '' : prototypeNote}
      ${content}
      <footer class="site-footer">${portalName}${staff || staffMode
        ? html` · ${staff?.role === 'teacher' ? 'Кабинет преподавателя' : staff?.role === 'leadership' ? 'Кабинет руководителя' : 'Учебный офис'}` : ''}
        ${prototypeInFooter ? prototypeNote : ''}
        ${presentationControl()}
      </footer>
    </body></html>`;
}

export function messagePage(title, message, href = '/login', action = 'Вернуться ко входу', options = {}) {
  return layout(title, html`<main class="page narrow" id="content"><h1>${title}</h1><p>${message}</p>
    <a href="${href}">${action}</a></main>`, options);
}
