import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';
import { gradeCourseKey } from './grades.js';

const gradeNumber = new Intl.NumberFormat('ru', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const filters = [
  { view: 'all', href: '/grades', label: 'Все результаты', empty: 'Ведомость пока пуста.' },
  { view: 'pending', href: '/grades?view=pending', label: 'Ждут результата', empty: 'Все результаты выставлены.' },
  { view: 'debts', href: '/grades?view=debts', label: 'Задолженности', empty: 'Задолженностей нет.' },
];

function result(grade) {
  if (grade.state === 'debts') return html`<strong class="status-pill is-error">${grade.result}</strong>`;
  if (grade.result) return html`<span class="status-pill${grade.passed ? ' is-ready' : ''}"><strong>${grade.result}</strong></span>`;
  return html`<span class="status-pill">Ещё не выставлен${grade.exam_date ? html` · ${formatDate(grade.exam_date)}` : ''}</span>`;
}

export function gradesPage({ view, rows, hasGrades, average, pendingCount, debtCount }, student, csrf) {
  return layout('Ведомость', html`
    <main id="content" class="page grades">
      <header class="identity directory-title">
        <div><p class="eyebrow">Успеваемость</p><h1>Ведомость</h1></div>
        <a class="button-link primary" href="/grades/transcript">Выписка об успеваемости</a>
      </header>
      <dl class="grade-overview">
        <div><dt>Средний балл</dt><dd>${average === null ? '—' : gradeNumber.format(average)}</dd></div>
        <div><dt>Ждут результата</dt><dd>${pendingCount}</dd></div>
        <div><dt>Задолженности</dt><dd>${debtCount}</dd></div>
      </dl>
      <nav class="section-links" aria-label="Фильтр ведомости">
        ${filters.map(filter => filter.view === view
          ? html`<a href="${filter.href}" aria-current="page">${filter.label}</a>`
          : html`<a href="${filter.href}">${filter.label}</a>`)}
      </nav>
      ${rows.length
        ? html`<dl class="grade-results">${rows.map(grade => html`
            <div id="grade-${grade.id}" tabindex="-1">
              <dt><a href="/grades/${grade.id}/history">${grade.subject}</a><span>${grade.assessment}</span></dt>
              <dd>${result(grade)}</dd>
            </div>`)}
          </dl>`
        : html`<p class="section-empty">${filters.find(filter => filter.view === (hasGrades ? view : 'all')).empty}</p>`}
    </main>`, { student, csrf, active: 'grades' });
}

export function gradeHistoryPage(history, student, csrf) {
  return layout(history.subject, html`
    <main id="content" class="page narrow">
      <a class="back-link" href="/grades">Вся ведомость</a>
      <header class="identity"><p class="eyebrow">${history.assessment}</p><h1>${history.subject}</h1></header>
      <h2>История результатов</h2>
      <ol class="office-records grade-history" role="list">${history.attempts.map((attempt, index) => html`
        <li>
          <div>
            <strong>${attempt.result || 'Ещё не выставлен'}</strong>
            <p>${attempt.published_at
              ? `${attempt.kind === 'retake' ? 'Пересдача' : 'Ведомость'} № ${attempt.sheet_id} · ${formatDate(attempt.published_at)}`
              : attempt.exam_date && !attempt.result ? formatDate(attempt.exam_date) : 'Ранее внесённая запись'}</p>
          </div>
          ${index === 0 ? html`<span class="status-pill">Текущая запись</span>` : ''}
        </li>`)}</ol>
    </main>`, { student, csrf, active: 'grades' });
}

export function transcriptPage(grades, courses, student, csrf) {
  const credits = new Map(courses.map(course => [gradeCourseKey(course), course.credits]));
  const results = grades.filter(grade => grade.result);
  return layout('Выписка об успеваемости', html`
    <main id="content" class="page transcript printable">
      <a class="back-link print-help" href="/grades">Ведомость</a>
      <header class="identity">
        <p class="eyebrow">Успеваемость</p><h1>Выписка об успеваемости</h1>
        <p>${student.full_name} · ${student.program} · ${student.group_code}</p>
      </header>
      <p class="print-help">Для PDF выберите «Печать» в меню браузера.</p>
      ${results.length ? html`<dl class="plan-courses">${results.map(grade => html`
        <div><dt>${grade.subject}<span>${grade.assessment}${credits.has(gradeCourseKey(grade)) ? ` · ${credits.get(gradeCourseKey(grade))} з. е.` : ''}</span></dt>
          <dd>${grade.result}</dd></div>`)}</dl>` : html`<p class="section-empty">Выставленных результатов пока нет.</p>`}
    </main>`, { student, csrf, active: 'grades' });
}
