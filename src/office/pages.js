import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

function officePage(title, content, context, active) {
  return layout(title, html`<main class="page office-page" id="content">${content}</main>`, { ...context, active });
}

export function officeLogin(csrf, login = '', error = '') {
  return layout('Вход для сотрудника', html`
    <main id="content" class="page staff-login">
      <div class="office-banner">
        <h1>Учебный офис</h1>
        <p>Войдите, чтобы открыть рабочий кабинет.</p>
      </div>
      <section class="login-panel" aria-labelledby="office-login-title">
        <h2 id="office-login-title">Вход для сотрудника</h2>
        ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
        <form method="post" action="/office/login">
          <input type="hidden" name="_csrf" value="${csrf}">
          <label for="office-login">Логин</label>
          <input name="login" id="office-login" value="${login}" maxlength="80" required autocomplete="username" autocapitalize="none" spellcheck="false">
          <label for="office-password">Пароль</label>
          <input name="password" id="office-password" type="password" required maxlength="256" autocomplete="current-password">
          <button class="primary">Войти</button>
        </form>
      </section>
    </main>`, { staffMode: true });
}

export function teacherHome(context) {
  return officePage('Кабинет преподавателя', html`
    <header class="identity"><h1>Кабинет преподавателя</h1></header>
    <p class="section-empty">Сейчас в кабинете нет доступных разделов.</p>`, context, 'office');
}

export function officeHome(totals, pending, cards, context) {
  const hasQueues = pending || totals.recoveries;
  return officePage('Рабочий стол', html`
    <div class="${hasQueues ? 'office-dashboard' : ''}">
      <section class="office-banner">
        <p class="eyebrow">Учебный офис</p>
        <h1>Рабочий стол</h1>
        <dl>
          ${pending ? html`<div><dt>Учебные заявки на рассмотрении</dt><dd>${pending.count}</dd></div>` : ''}
          <div><dt>Студентов</dt><dd>${totals.students}</dd></div>
          <div><dt>Групп</dt><dd>${totals.groups}</dd></div>
        </dl>
        ${pending ? html`<a class="button-link" href="/office/requests">Открыть реестр заявок</a>` : ''}
      </section>
      ${hasQueues ? html`<div class="office-dashboard-queues">
        ${totals.recoveries ? html`<section class="office-queue" aria-labelledby="office-recovery-title">
          <h2 id="office-recovery-title">Восстановление доступа</h2>
          <p>Ожидают рассмотрения · ${totals.recoveries}</p>
          <a class="button-link secondary" href="/office/recovery">Открыть запросы</a>
        </section>` : ''}
        ${pending ? html`<section class="office-queue">
          <h2>Новые заявки</h2>
          ${pending.content}
        </section>` : ''}
      </div>` : ''}
    </div>
    <div class="office-links">
      ${cards.filter(card => !totals.recoveries || card.path !== '/recovery').map(card => html`
        <a href="/office${card.path}"><strong>${card.label}</strong><span>${card.description}</span></a>`)}
    </div>`, context, 'office');
}

export function officeDirectory(rows, { groups, search, group, page, total }, context, registryEnabled) {
  const pageHref = number => `/office/students?${new URLSearchParams({ q: search, group, page: number })}`;
  return officePage('Студенты', html`
    <header class="identity directory-title">
      <div><p class="eyebrow">Контингент</p><h1>Студенты</h1></div>
      ${registryEnabled ? html`<div class="office-buttons"><a href="/office/registry">Программы и группы</a>
        <a class="button-link primary" href="/office/registry/enroll">Зачислить студента</a></div>` : ''}
    </header>
    <form class="directory-filter" method="get" action="/office/students">
      <div><label for="student-search">Имя студента</label>
        <input name="q" id="student-search" type="search" value="${search}" maxlength="100"></div>
      <div><label for="student-group">Группа</label><select name="group" id="student-group">
        <option value="">Все группы</option>
        ${groups.map(code => code === group ? html`<option selected>${code}</option>` : html`<option>${code}</option>`)}
      </select></div>
      <button class="secondary">Найти</button>
    </form>
    ${rows.length ? html`<ul class="office-records student-directory-list" role="list">${rows.map(student => html`
      <li><div><a href="/office/students/${student.id}">${student.full_name}</a><p>${student.program} · ${student.year} курс</p></div>
        <span class="status-pill">${student.group_code}</span></li>`)}</ul>` : html`<p class="section-empty">Студенты по этим условиям не найдены.</p>`}
    ${total > 30 ? html`<nav class="section-links" aria-label="Страницы списка студентов">
      ${page > 1 ? html`<a href="${pageHref(page - 1)}">Предыдущая</a>` : ''}
      ${page * 30 < total ? html`<a href="${pageHref(page + 1)}">Следующая</a>` : ''}
    </nav>` : ''}`, context, 'office-students');
}

export function officeStudent(student, plan, context, { history, registryEnabled, nameUpdated }) {
  return officePage(student.full_name, html`
    <div class="office-detail">
      <a class="back-link" href="/office/students">Все студенты</a>
      <header class="identity directory-title">
        <div><p class="eyebrow">${student.program} · ${student.group_code}</p><h1>${student.full_name}</h1></div>
        ${registryEnabled ? html`<div class="office-buttons">
          <a class="button-link secondary" href="/office/registry/students/${student.id}/name">Изменить ФИО</a>
          <a class="button-link primary" href="/office/registry/students/${student.id}/move">Сменить группу</a>
        </div>` : ''}
      </header>
      ${nameUpdated ? html`<p class="request-receipt" role="status">ФИО обновлено.</p>` : ''}
      <dl>
        <div><dt>Факультет</dt><dd>${student.faculty}</dd></div>
        <div><dt>Курс</dt><dd>${student.year}</dd></div>
        ${plan?.features.grades ? html`<div><dt>Освоено</dt><dd>${plan.earned} из ${plan.planned} з. е.</dd></div>` : ''}
      </dl>
      ${plan ? html`
        <h2>Учебный план</h2>
        ${plan.version ? html`<p>Действующая версия № ${plan.version}</p>` : ''}
        ${plan.courses.length ? html`<dl class="plan-courses">${plan.courses.map(course => html`
          <div><dt>${course.subject}<span>${course.assessment}${course.elective ? ' · По выбору' : course.retained ? ' · Из прежнего плана' : ''}</span></dt>
            <dd>${course.credits} з. е.${plan.features.grades ? ` · ${course.result || 'В ожидании'}` : ''}</dd></div>`)}</dl>`
          : html`<p>Учебный план пока пуст.</p>`}
        ${plan.postponed.length ? html`<h2>На следующий учебный год</h2><ul>${plan.postponed.map(course => html`
          <li><a href="/office/requests/${course.requestId}">${course.subject}</a></li>`)}</ul>` : ''}` : ''}
      ${history ?? ''}
    </div>`, context, 'office-students');
}
