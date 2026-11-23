import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';

function courseRow(course) {
  return html`<div>
    <dt>${course.syllabus ? html`<a href="/syllabuses/${course.syllabus}">${course.subject}</a>` : course.subject}
      <span>${course.assessment} · ${course.elective ? 'По выбору' : course.retained ? 'Из прежнего плана' : 'Обязательная'}</span>
    </dt>
    <dd>
      <span>${course.credits} з. е.</span>
      <span class="status-pill${course.passed ? ' is-ready' : course.state === 'debts' ? ' is-warning' : ''}">
        ${course.result || 'В ожидании результата'}
      </span>
    </dd>
  </div>`;
}

function courseAction(option, block, csrf) {
  if (!block.open || (!option.selected && option.seats_left <= 0)) return '';

  const replacing = block.options.some(row => row.selected);
  const label = option.selected ? 'Отменить запись' : replacing ? 'Заменить выбор' : 'Записаться';
  const mode = option.selected ? 'withdraw' : 'choice';
  return html`<form action="/plan/${block.id}/${mode}" method="post">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="hidden" name="option" value="${option.id}">
    <button class="${option.selected ? 'secondary' : 'primary'}" aria-label="${label} · ${option.subject}">${label}</button>
  </form>`;
}

const seatCount = new Intl.PluralRules('ru');
const seatForms = { one: 'место', few: 'места', many: 'мест' };

function choiceBlock(block, csrf) {
  return html`<section class="plan-block" id="choice-${block.id}" aria-labelledby="choice-title-${block.id}">
    <header>
      <h3 id="choice-title-${block.id}">${block.title}</h3>
      <p>${block.period} · ${block.open ? 'Один курс на выбор' : 'Запись закрыта'}</p>
    </header>
    ${block.options.length ? html`<ul class="plan-options" role="list">${block.options.map(option => html`
      <li class="plan-option">
        <div>
          <h4>${option.subject}</h4>
          <p>${option.description}</p>
          <p class="plan-option-meta">${option.credits} з. е. · ${option.assessment}
            ${block.open && option.seats_left > 0
              ? html` · Свободно ${option.seats_left} ${seatForms[seatCount.select(option.seats_left)]}` : ''}
          </p>
        </div>
        <div class="plan-option-action">
          ${option.selected ? html`<span class="status-pill is-ready">Включён в план</span>`
            : block.open && option.seats_left <= 0 ? html`<span class="status-pill is-warning">Нет мест</span>` : ''}
          ${courseAction(option, block, csrf)}
        </div>
      </li>`)}</ul>` : html`<p class="section-empty">Варианты курсов ещё не опубликованы.</p>`}
  </section>`;
}

function choiceHistory(history) {
  return html`<details class="plan-history">
    <summary>История выбора</summary>
    ${history.length ? html`<ol>${history.map(event => {
      const date = event.changed_at.slice(0, 10);
      const action = event.previous_subject
        ? event.next_subject ? `Курс заменён · ${event.previous_subject} → ${event.next_subject}` : `Запись отменена · ${event.previous_subject}`
        : `Запись на курс · ${event.next_subject}`;
      return html`<li><strong>${action}</strong>
        <span>${event.title} · <time datetime="${date}">${formatDate(event.changed_at)}</time></span></li>`;
    })}</ol>` : html`<p class="section-empty">Здесь появятся записи, замены и отмены курсов.</p>`}
  </details>`;
}

export function planPage({ courses, postponed, version, blocks, history, earned, planned }, { student, csrf, error }) {
  return layout('Учебный план', html`
    <main id="content" class="page study-plan">
      <header class="identity">
        <p class="eyebrow">${student.program} · ${student.group_code}</p>
        <h1>Учебный план</h1>
        ${version ? html`<span class="status-pill is-ready">Действующая версия № ${version}</span>` : ''}
      </header>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
      ${planned ? html`<div class="plan-summary">
        <label for="credit-progress">Освоено <strong>${earned} из ${planned} з. е.</strong></label>
        <progress id="credit-progress" max="${planned}" value="${earned}"></progress>
      </div>` : ''}
      <nav class="section-links" aria-label="Разделы учебного плана">
        <a href="#subjects">Мои дисциплины</a>
        ${postponed.length ? html`<a href="#postponed">Следующий учебный год</a>` : ''}
        <a href="#electives">Дисциплины по выбору</a>
        <a href="/syllabuses">Силлабусы</a>
      </nav>
      <section id="subjects" aria-labelledby="plan-subjects-title">
        <h2 id="plan-subjects-title">Мои дисциплины</h2>
        ${courses.length ? html`<dl class="plan-courses">${courses.map(courseRow)}</dl>`
          : html`<p class="section-empty">Для вашей группы учебный план ещё не опубликован.</p>`}
      </section>
      ${postponed.length ? html`<section id="postponed" aria-labelledby="postponed-title">
        <h2 id="postponed-title">На следующий учебный год</h2>
        <dl class="plan-courses">${postponed.map(course => html`<div>
          <dt>${course.subject}<span>${course.assessment} · ${course.credits} з. е.</span></dt>
          <dd><a href="/requests/${course.requestId}">Решение о переносе</a></dd>
        </div>`)}</dl>
      </section>` : ''}
      <section id="electives" aria-labelledby="plan-choice-title">
        <h2 id="plan-choice-title">Дисциплины по выбору</h2>
        ${blocks.length ? blocks.map(block => choiceBlock(block, csrf))
          : html`<p class="section-empty">Для вашей группы пока нет блоков выбора.</p>`}
      </section>
      ${choiceHistory(history)}
    </main>`, { student, csrf, active: 'plan' });
}
