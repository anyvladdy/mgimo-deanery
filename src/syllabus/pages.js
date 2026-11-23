import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

const sections = [
  ['summary', 'О курсе'],
  ['requirements', 'Что нужно знать до начала'],
  ['assessment', 'Формула оценки'],
  ['literature', 'Литература и материалы'],
];

export function syllabusesPage(syllabuses, search, { student, staff, csrf }) {
  const path = staff ? '/office/syllabuses' : '/syllabuses';
  return layout('Силлабусы', html`
    <main id="content" class="page directory">
      <header class="identity directory-title">
        <div><p class="eyebrow">Дисциплины</p><h1>Силлабусы</h1></div>
        ${staff ? html`<a class="button-link primary" href="${path}/new">Добавить силлабус</a>` : ''}
      </header>
      <form class="directory-filter" method="get" action="${path}">
        <div><label for="syllabus-search">Название дисциплины</label>
          <input id="syllabus-search" type="search" name="q" value="${search}" maxlength="100"></div>
        <button class="secondary">Найти</button>
      </form>
      ${syllabuses.length ? html`<ul class="directory-grid" role="list">${syllabuses.map(course => html`
        <li><h2><a href="${path}/${course.id}">${course.subject}</a></h2><p>${course.summary}</p></li>`)}</ul>`
        : html`<p class="section-empty">${search ? 'По этому запросу дисциплин нет.' : 'Силлабусы ещё не опубликованы.'}</p>`}
    </main>`, { student, staff, csrf, active: staff ? 'office-syllabuses' : 'plan' });
}

export function syllabusPage(syllabus, student, csrf) {
  return layout(syllabus.subject, html`
    <main id="content" class="page narrow syllabus">
      <a class="back-link" href="/syllabuses">Все силлабусы</a>
      <header class="identity"><p class="eyebrow">Силлабус</p><h1>${syllabus.subject}</h1></header>
      ${sections.map(([key, label]) => syllabus[key] ? html`
        <section class="syllabus-section"><h2>${label}</h2><p>${syllabus[key]}</p></section>` : '')}
    </main>`, { student, csrf, active: 'plan' });
}

export function syllabusEditor(syllabus, subjects, { staff, csrf }, error = '', status = '') {
  const action = syllabus.id ? `/office/syllabuses/${syllabus.id}` : '/office/syllabuses/new';
  const title = syllabus.id ? syllabus.subject : 'Новый силлабус';
  return layout(title, html`
    <main id="content" class="page narrow syllabus">
      <a class="back-link" href="/office/syllabuses">Все силлабусы</a>
      <header class="identity"><p class="eyebrow">Учебный офис</p><h1>${title}</h1></header>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
      ${status ? html`<p class="status-pill is-ready" role="status">${status}</p>` : ''}
      ${syllabus.id || subjects.length ? html`
        <form class="form-panel" method="post" action="${action}">
          <input type="hidden" name="_csrf" value="${csrf}">
          ${syllabus.id ? '' : html`<label for="subject">Дисциплина</label>
            <select name="subject" id="subject" required>
              <option value="">Выберите дисциплину</option>
              ${subjects.map(subject => subject === syllabus.subject
                ? html`<option value="${subject}" selected>${subject}</option>`
                : html`<option value="${subject}">${subject}</option>`)}
            </select>`}
          ${sections.map(([key, label]) => html`
            <label for="${key}">${label}</label>
            <textarea id="${key}" name="${key}" rows="3" maxlength="1200" required>${syllabus[key] ?? ''}</textarea>`)}
          <button class="primary">Опубликовать</button>
        </form>` : html`<p>У всех дисциплин уже есть силлабусы.</p>`}
    </main>`, { staff, csrf, active: 'office-syllabuses' });
}
