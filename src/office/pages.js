import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';
import { certificateKind, initialStatus, readyStatus, approvedStatus, rejectedStatus, postponementKind, waitingStatus, clarificationLimit } from '../requests/requests.js';
import { clarificationHistory } from '../requests/pages.js';
import { movementHistory } from '../registry/pages.js';

function status(value) {
  return html`<span class="status-pill${[readyStatus, approvedStatus].includes(value) ? ' is-ready' : [rejectedStatus, waitingStatus].includes(value) ? ' is-warning' : ''}">${value}</span>`;
}

function officePage(title, content, context, active) {
  return layout(title, html`<main class="page office-page" id="content">${content}</main>`, { ...context, active });
}

export function officeLogin(csrf, login = '', error = '') {
  return layout('Вход для сотрудника', html`
    <main id="content" class="page staff-login">
      <div class="office-banner">
        <p class="eyebrow">Деканат</p>
        <h1>Учебный офис</h1>
        <p>Заявки студентов, учебные планы и силлабусы.</p>
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

function inboxRows(rows, empty) {
  return rows.length ? html`<ul class="office-records" role="list">${rows.map(request => html`
    <li><div>
      <a href="/office/requests/${request.id}">${request.subject ?? request.kind}</a>
      <p>${request.full_name} · ${request.group_code} · ${formatDate(request.created_at)}</p>
    </div>${status(request.status)}</li>`)}</ul>`
    : html`<p class="section-empty">${empty}</p>`;
}

export function officeHome(totals, pending, context) {
  return officePage('Рабочий стол', html`
    <div class="office-dashboard">
      <section class="office-banner">
        <p class="eyebrow">Учебный офис</p>
        <h1>Рабочий стол</h1>
        <dl>
          <div><dt>На рассмотрении</dt><dd>${pending.length}</dd></div>
          <div><dt>Студентов</dt><dd>${totals.students}</dd></div>
          <div><dt>Групп</dt><dd>${totals.groups}</dd></div>
        </dl>
        <a class="button-link" href="/office/requests">Открыть реестр заявок</a>
      </section>
      <section class="office-queue">
        <h2>Новые заявки</h2>
        ${inboxRows(pending.slice(0, 5), 'Все заявки обработаны.')}
      </section>
    </div>
    <div class="office-links">
      <a href="/office/schedule"><strong>Расписание</strong><span>Публикация переноса аудитории</span></a>
      <a href="/office/students"><strong>Контингент</strong><span>Студенты, программы и индивидуальные планы</span></a>
      <a href="/office/syllabuses"><strong>Силлабусы</strong><span>Описание дисциплин и условия оценки</span></a>
      <a href="/office/registry"><strong>Программы и группы</strong><span>Новые программы, группы и зачисление</span></a>
      <a href="/office/curriculum"><strong>Учебные планы</strong><span>Черновики, публикации и архив версий</span></a>
    </div>`, context, 'office');
}

export function officeInbox(rows, view, context) {
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
    ${inboxRows(rows, empty[view])}`, context, 'office-requests');
}

export function officeRequestPage(request, context, error = '', comment = '', question = '') {
  const actionable = request.status === initialStatus && [certificateKind, postponementKind].includes(request.kind);
  const cycle = request.clarifications.at(-1)?.id ?? 0;
  return officePage(request.kind, html`
    <div class="office-detail">
      <a class="back-link" href="/office/requests">Все заявки</a>
      <header class="identity"><p class="eyebrow">Заявка № ${request.id}</p><h1>${request.kind}</h1></header>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
      <dl>
        <div><dt>Студент</dt><dd><a href="/office/students/${request.student_id}">${request.full_name}</a> · ${request.group_code}</dd></div>
        <div><dt>Дата подачи</dt><dd>${formatDate(request.created_at)}</dd></div>
        ${request.subject ? html`<div><dt>Дисциплина</dt><dd>${request.subject} · ${request.assessment}</dd></div>` : ''}
        <div><dt>Статус</dt><dd>${status(request.status)}</dd></div>
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

export function officeDirectory(rows, { groups, search, group, page, total }, context) {
  const pageHref = number => `/office/students?${new URLSearchParams({ q: search, group, page: number })}`;
  return officePage('Студенты', html`
    <header class="identity directory-title">
      <div><p class="eyebrow">Контингент</p><h1>Студенты</h1></div>
      <div class="office-buttons"><a href="/office/registry">Программы и группы</a>
        <a class="button-link primary" href="/office/registry/enroll">Зачислить студента</a></div>
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
    ${rows.length ? html`<ul class="office-records" role="list">${rows.map(student => html`
      <li><div><a href="/office/students/${student.id}">${student.full_name}</a><p>${student.program} · ${student.year} курс</p></div>
        <span class="status-pill">${student.group_code}</span></li>`)}</ul>` : html`<p class="section-empty">Студенты по этим условиям не найдены.</p>`}
    ${total > 30 ? html`<nav class="section-links" aria-label="Страницы списка студентов">
      ${page > 1 ? html`<a href="${pageHref(page - 1)}">Предыдущая</a>` : ''}
      ${page * 30 < total ? html`<a href="${pageHref(page + 1)}">Следующая</a>` : ''}
    </nav>` : ''}`, context, 'office-students');
}

export function officeStudent(student, plan, movements, context) {
  return officePage(student.full_name, html`
    <div class="office-detail">
      <a class="back-link" href="/office/students">Все студенты</a>
      <header class="identity directory-title">
        <div><p class="eyebrow">${student.program} · ${student.group_code}</p><h1>${student.full_name}</h1></div>
        <a class="button-link primary" href="/office/registry/students/${student.id}/move">Сменить группу</a>
      </header>
      <dl>
        <div><dt>Факультет</dt><dd>${student.faculty}</dd></div>
        <div><dt>Курс</dt><dd>${student.year}</dd></div>
        <div><dt>Освоено</dt><dd>${plan.earned} из ${plan.planned} з. е.</dd></div>
      </dl>
      <h2>Учебный план</h2>
      ${plan.version ? html`<p>Действующая версия № ${plan.version}</p>` : ''}
      ${plan.courses.length ? html`<dl class="plan-courses">${plan.courses.map(course => html`
        <div><dt>${course.subject}<span>${course.assessment}${course.elective ? ' · По выбору' : course.retained ? ' · Из прежнего плана' : ''}</span></dt>
          <dd>${course.credits} з. е. · ${course.result || 'В ожидании'}</dd></div>`)}</dl>` : html`<p>Учебный план пока пуст.</p>`}
      ${plan.postponed.length ? html`<h2>На следующий учебный год</h2><ul>${plan.postponed.map(course => html`
        <li><a href="/office/requests/${course.requestId}">${course.subject}</a></li>`)}</ul>` : ''}
      ${movementHistory(movements, true)}
    </div>`, context, 'office-students');
}
