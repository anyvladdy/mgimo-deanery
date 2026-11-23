import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { pluralRu } from '../ui/plural.js';
import { formatDate } from '../ui/format.js';

function page(title, body, context) {
  return layout(title, html`<main id="content" class="page office-page">${body}</main>`, { ...context, active: 'office-registry' });
}

function heading(title, eyebrow = 'Контингент') {
  return html`<header class="identity"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1></header>`;
}

function errorNote(error) {
  return error ? html`<p class="error" role="alert">${error}</p>` : '';
}

function groupOption(group, selected) {
  const label = `${group.code} · ${group.program} · ${group.year} курс`;
  return group.code === selected
    ? html`<option value="${group.code}" selected>${label}</option>`
    : html`<option value="${group.code}">${label}</option>`;
}

export function registryPage(programs, context, error = '') {
  return page('Программы и группы', html`
    ${heading('Программы и группы')}
    ${errorNote(error)}
    <div class="registry-grid">
      <section class="office-queue" id="programs">
        <h2>Образовательные программы</h2>
        ${programs.length ? programs.map(program => html`
          <section class="program-row">
            <h3>${program.name}</h3>
            <p>${program.faculty}</p>
            ${program.groups.length ? html`<ul class="program-groups" role="list">${program.groups.map(group => html`
              <li><a href="/office/curriculum/groups/${encodeURIComponent(group.code)}">${group.code}</a>
                <span>${group.year} курс · ${group.students} ${pluralRu(group.students, 'студент', 'студента', 'студентов')} в группе</span></li>`)}</ul>` : html`<p>Группы пока не добавлены.</p>`}
          </section>`) : html`<p class="section-empty">Добавьте первую программу.</p>`}
      </section>
      <aside class="registry-actions">
        <section class="office-queue">
          <h2>Новая программа</h2>
          <form class="form-panel" method="post" action="/office/registry/programs">
            <input type="hidden" name="_csrf" value="${context.csrf}">
            <label for="program-name">Название</label>
            <input id="program-name" name="name" maxlength="120" required>
            <label for="program-faculty">Факультет</label>
            <input id="program-faculty" name="faculty" maxlength="120" required>
            <button class="secondary">Добавить программу</button>
          </form>
        </section>
        ${programs.length ? html`
          <section class="office-queue">
            <h2>Новая группа</h2>
            <form class="form-panel" method="post" action="/office/registry/groups">
              <input type="hidden" name="_csrf" value="${context.csrf}">
              <label for="group-program">Программа</label>
              <select id="group-program" name="program" required>
                <option value="">Выберите программу</option>
                ${programs.map(program => html`<option value="${program.name}">${program.name}</option>`)}
              </select>
              <label for="group-code">Код группы</label>
              <input id="group-code" name="code" maxlength="20" required>
              <label for="group-year">Курс</label>
              <input id="group-year" name="year" type="number" min="1" value="1" required>
              <button class="secondary">Добавить группу</button>
            </form>
          </section>` : ''}
      </aside>
    </div>`, context);
}

export function enrollmentPage(groups, context, values, error) {
  return page('Зачисление', html`
    <div class="office-detail">
      <a class="back-link" href="/office/students">Все студенты</a>
      ${heading('Зачислить студента')}
      ${errorNote(error)}
      ${groups.length ? html`
        <form class="office-queue form-panel" method="post" action="/office/registry/enroll">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          <label for="student-name">Имя и фамилия</label>
          <input id="student-name" name="name" maxlength="120" value="${values.name ?? ''}" required>
          <label for="student-login">Логин студента</label>
          <input id="student-login" name="login" minlength="3" maxlength="40"
            value="${values.login ?? ''}" spellcheck="false" autocapitalize="none" required>
          <label for="enroll-group">Группа</label>
          <select id="enroll-group" name="group" required><option value="">Выберите группу</option>
            ${groups.map(group => groupOption(group, values.group))}
          </select>
          <p class="hint">Пароль появится на экране подтверждения.</p>
          <button class="primary">Зачислить и создать аккаунт</button>
        </form>` : html`<p>Добавьте программу и группу. <a href="/office/registry">К реестру групп</a></p>`}
    </div>`, context);
}

export function enrollmentReceipt(student, context) {
  return page('Студент зачислен', html`
    <div class="office-detail">
      ${heading('Студент зачислен')}
      <section class="office-queue">
        <h2>${student.name}</h2>
        <p>${student.group.program} · группа ${student.group.code}</p>
        <dl>
          <div><dt>Логин</dt><dd><code>${student.login}</code></dd></div>
          <div><dt>Пароль для входа</dt><dd><code>${student.password}</code></dd></div>
        </dl>
        <p class="hint">Сохраните пароль для передачи студенту. Он доступен только на этой странице.</p>
        <a href="/office/students/${student.studentId}">Открыть карточку студента</a>
      </section>
    </div>`, context);
}

export function movePage(student, groups, target, retained, context, error = '') {
  const path = `/office/registry/students/${student.id}/move`;
  return page('Смена группы', html`
    <div class="office-detail">
      <a class="back-link" href="/office/students/${student.id}">Карточка студента</a>
      ${heading('Смена группы', student.full_name)}
      ${errorNote(error)}
      ${groups.length ? html`
        <form class="directory-filter" method="get" action="${path}">
          <div><label for="move-group">Куда перевести</label>
            <select id="move-group" name="group" required><option value="">Выберите группу</option>
              ${groups.map(group => groupOption(group, target?.code))}
            </select>
          </div>
          <button class="secondary">Посмотреть переход</button>
        </form>` : html`<p>Других групп в реестре пока нет.</p>`}
      <dl>
        <div><dt>Текущая группа</dt><dd>${student.group_code} · ${student.program} · ${student.year} курс</dd></div>
        ${target ? html`<div><dt>После перевода</dt><dd>${target.code} · ${target.program} · ${target.year} курс</dd></div>` : ''}
      </dl>
      ${target ? html`<section class="office-queue">
        <h2>Что перенесётся в личный план</h2>
        ${retained.length ? html`<ul>${retained.map(course => html`<li>${course.subject} · ${course.credits} з. е.</li>`)}</ul>`
          : html`<p>В плане появятся обязательные дисциплины новой группы.</p>`}
        <form class="form-panel" method="post" action="${path}">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          <input type="hidden" name="expected" value="${student.group_code}">
          <input type="hidden" name="group" value="${target.code}">
          <button class="primary">Подтвердить перевод в ${target.code}</button>
        </form>
      </section>` : ''}
    </div>`, context);
}

export function movementHistory(history, showStaff = false) {
  return history.length ? html`<section id="movements" aria-labelledby="movements-title">
    <h2 id="movements-title">История обучения</h2>
    <ul class="office-records" role="list">${history.map(event => html`<li>
      <div>
        <strong>${event.previous_group ? `Перевод из ${event.previous_group} в ${event.next_group}` : `Зачисление в ${event.next_group}`}</strong>
        <p>${event.program}${showStaff ? ` · ${event.staff_name}` : ''}</p>
      </div>
      <time datetime="${event.changed_at.slice(0, 10)}">${formatDate(event.changed_at)}</time>
    </li>`)}</ul>
  </section>` : '';
}
