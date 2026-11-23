import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { presentationVariant } from '../ui/presentation.js';
import { parseTimestamp } from '../modules/clock.js';
import { formatDate } from '../ui/format.js';

function courseRow(course, hasGrades, disciplineHref) {
  const href = disciplineHref?.(course) ?? (course.syllabus ? `/syllabuses/${course.syllabus}` : null);
  return html`<div>
    <dt>${href ? html`<a href="${href}">${course.subject}</a>` : course.subject}
      <span>${course.assessment} · ${course.elective ? 'По выбору' : course.retained ? 'Из прежнего плана' : 'Обязательная'}</span>
    </dt>
    <dd>
      <span>${course.credits} з. е.</span>
      ${disciplineHref && course.syllabus ? html`<a href="/syllabuses/${course.syllabus}">Силлабус</a>` : ''}
      ${hasGrades ? html`<span class="status-pill${course.passed ? ' is-ready' : course.state === 'debts' ? ' is-warning' : ''}">
        ${course.result || 'В ожидании результата'}
      </span>` : ''}
    </dd>
  </div>`;
}

function courseAction(option, block, csrf, base) {
  if (!block.open || (!option.selected && option.seats_left <= 0)) return '';

  const replacing = block.options.some(row => row.selected);
  const label = option.selected ? 'Отменить запись' : replacing ? 'Заменить выбор' : 'Записаться';
  const mode = option.selected ? 'withdraw' : 'choice';
  return html`<form action="${base}/${block.id}/${mode}" method="post">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="hidden" name="option" value="${option.id}">
    <button class="${option.selected ? 'secondary' : 'primary'}" aria-label="${label} · ${option.subject}">${label}</button>
  </form>`;
}

const seatCount = new Intl.PluralRules('ru');
const seatForms = { one: 'место', few: 'места', many: 'мест' };

function choiceBlock(block, csrf, { base = '/plan', preview = false } = {}) {
  const selected = block.options.find(option => option.selected);
  return html`<section class="plan-block" id="choice-${block.id}" aria-labelledby="choice-title-${block.id}">
    <header>
      <h3 id="choice-title-${block.id}">${block.title}</h3>
      <p>${block.period} · ${block.open ? 'Один курс на выбор' : 'Запись закрыта'}</p>
    </header>
    ${preview ? html`<div class="design-plan-choice-preview" hidden>
      <p>${selected ? html`Выбрано <strong>${selected.subject}</strong>` : 'Курс ещё не выбран.'}</p>
      <a class="button-link secondary" href="/electives#choice-${block.id}">Открыть тур выбора</a>
    </div>` : ''}
    <div${preview ? html` class="design-plan-choice-inline"` : ''}>${block.options.length ? html`<ul class="plan-options" role="list">${block.options.map(option => html`
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
          ${courseAction(option, block, csrf, base)}
        </div>
      </li>`)}</ul>` : html`<p class="section-empty">Варианты курсов ещё не опубликованы.</p>`}</div>
  </section>`;
}

function choiceHistory(history) {
  return html`<details class="plan-history">
    <summary>История выбора</summary>
    ${history.length ? html`<ol>${history.map(event => {
      const date = parseTimestamp(event.changed_at).toISOString();
      const action = event.previous_subject
        ? event.next_subject ? `Курс заменён · ${event.previous_subject} → ${event.next_subject}` : `Запись отменена · ${event.previous_subject}`
        : `Запись на курс · ${event.next_subject}`;
      return html`<li><strong>${action}</strong>
        <span>${event.title} · <time datetime="${date}">${formatDate(event.changed_at)}</time></span></li>`;
    })}</ol>` : html`<p class="section-empty">Здесь появятся записи, замены и отмены курсов.</p>`}
  </details>`;
}

export function electivesPage({ blocks, history }, { student, csrf, error }) {
  return layout('Дисциплины по выбору', html`
    <main id="content" class="page study-plan electives-page">
      <a class="back-link" href="/plan">Учебный план</a>
      <header class="identity"><h1>Дисциплины по выбору</h1>
        <p class="hint">Выберите один курс в каждом открытом туре. Запись появится в учебном плане.</p>
      </header>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
      <section aria-labelledby="elective-tours">
        <h2 id="elective-tours">Туры выбора</h2>
        ${blocks.length ? blocks.map(block => choiceBlock(block, csrf, { base: '/electives' }))
          : html`<p class="section-empty">Для вашей группы пока нет блоков выбора.</p>`}
      </section>
      ${choiceHistory(history)}
    </main>`, { student, csrf, active: 'electives' });
}

export function planPage({ courses, postponed, version, blocks, history, earned, planned, features }, { student, csrf, error, disciplineHref }) {
  const preview = features.electives && presentationVariant() !== 'lite';
  return layout('Учебный план', html`
    <main id="content" class="page study-plan">
      <header class="identity">
        <p class="eyebrow">${student.program} · ${student.group_code}</p>
        <h1>Учебный план</h1>
        ${version ? html`<span class="status-pill is-ready">Действующая версия № ${version}</span>` : ''}
      </header>
      ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
      ${planned && features.grades ? html`<div class="plan-summary">
        <label for="credit-progress">Освоено <strong>${earned} из ${planned} з. е.</strong></label>
        <progress id="credit-progress" max="${planned}" value="${earned}"></progress>
      </div>` : planned ? html`<p>По учебному плану · ${planned} з. е.</p>` : ''}
      <nav class="section-links" aria-label="Разделы учебного плана">
        <a href="#subjects">Мои дисциплины</a>
        ${postponed.length ? html`<a href="#postponed">Следующий учебный год</a>` : ''}
        ${features.electives ? html`<a href="#electives">Дисциплины по выбору</a>` : ''}
        ${features.syllabus ? html`<a href="/syllabuses">Силлабусы</a>` : ''}
      </nav>
      <section id="subjects" aria-labelledby="plan-subjects-title">
        <h2 id="plan-subjects-title">Мои дисциплины</h2>
        ${courses.length ? html`<dl class="plan-courses">${courses.map(course => courseRow(course, features.grades, disciplineHref))}</dl>`
          : html`<p class="section-empty">Для вашей группы учебный план ещё не опубликован.</p>`}
      </section>
      ${postponed.length ? html`<section id="postponed" aria-labelledby="postponed-title">
        <h2 id="postponed-title">На следующий учебный год</h2>
        <dl class="plan-courses">${postponed.map(course => html`<div>
          <dt>${disciplineHref ? html`<a href="${disciplineHref(course)}">${course.subject}</a>` : course.subject}<span>${course.assessment} · ${course.credits} з. е.</span></dt>
          <dd>${course.requestId ? html`<a href="/requests/${course.requestId}">Решение о переносе</a>` : 'Перенос одобрен'}</dd>
        </div>`)}</dl>
      </section>` : ''}
      ${features.electives ? html`<section id="electives" aria-labelledby="plan-choice-title">
        <h2 id="plan-choice-title">Дисциплины по выбору</h2>
        ${preview ? html`<a class="back-link design-plan-choice-preview" href="/electives" hidden>Все туры выбора</a>` : ''}
        ${blocks.length ? blocks.map(block => choiceBlock(block, csrf, { preview }))
          : html`<p class="section-empty">Для вашей группы пока нет блоков выбора.</p>`}
      </section>
      ${preview ? html`<div class="design-plan-choice-inline">${choiceHistory(history)}</div>` : choiceHistory(history)}` : ''}
    </main>`, { student, csrf, active: 'plan' });
}
