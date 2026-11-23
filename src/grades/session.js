import { html } from 'hono/html';
import { modulesFor } from '../modules/config.js';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';
import { pluralRu } from '../ui/plural.js';
import { gradeOverview, gradeRowsForOverview, upcomingSessionAssessmentsForStudent } from './grades.js';

const monthName = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const atMidnight = date => Date.parse(`${date}T00:00:00Z`);

function countdown(today, date) {
  const days = (atMidnight(date) - atMidnight(today)) / 86_400_000;
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Завтра';
  return `Через ${days} ${pluralRu(days, 'день', 'дня', 'дней')}`;
}

function assessmentCard(row, today) {
  return html`<li class="today-panel" id="assessment-${row.id}">
    <header class="directory-title">
      <div><h3>${row.subject}</h3><p class="hint">${row.assessment}</p></div>
      <span class="status-pill">${countdown(today, row.exam_date)}</span>
    </header>
    <p>${row.details}</p>
    ${row.isNew ? html`<span class="status-pill is-new">Новое</span>` : ''}
    ${row.previous ? html`<p><strong>Изменение.</strong> Было: ${row.previous}</p>` : ''}
    ${row.checks.length ? html`<p><strong>Проверьте перед экзаменом</strong></p>
      <ul class="session-checks">${row.checks.map(check => html`<li>${check}</li>`)}</ul>` : ''}
    <div class="office-buttons">
      <a class="button-link secondary" href="/grades?view=pending#grade-${row.id}">Открыть ведомость</a>
      ${row.cardHref ? html`<a class="button-link secondary" href="${row.cardHref}">Карточка дисциплины</a>` : ''}
      ${row.previous && row.noticeHref ? html`<a class="button-link secondary" href="${row.noticeHref}">Уведомление об изменении</a>` : ''}
    </div>
  </li>`;
}

export function sessionPage(db, studentId, today, context, cardHref) {
  const modules = modulesFor(db);
  const exams = modules.get('exams');
  const syllabuses = modules.get('syllabus');
  const rows = gradeOverview(gradeRowsForOverview(db, studentId), 'all').rows;
  const bySubject = Map.groupBy(rows, row => row.subject);
  const read = new Set(exams?.examSlotReadIds(db, studentId));
  const upcoming = upcomingSessionAssessmentsForStudent(db, studentId, today)
    .sort((left, right) => left.exam_date.localeCompare(right.exam_date)
      || (left.exam_time || '99:99').localeCompare(right.exam_time || '99:99')
      || left.subject.localeCompare(right.subject, 'ru'))
    .map(row => {
      const related = bySubject.get(row.subject) ?? [];
      const checks = [];
      if (related.some(grade => grade.state === 'debts')) checks.push('Есть задолженность по дисциплине.');
      if (related.some(grade => grade.id !== row.id && grade.state === 'pending')) checks.push('Есть другие ожидаемые результаты.');
      if (syllabuses && !syllabuses.syllabusForSubject(db, row.subject)) checks.push('Силлабус пока не опубликован.');
      return {
        ...row, checks,
        details: exams?.examDetails(row) || formatDate(row.exam_date),
        previous: exams?.previousExamDetails(row),
        isNew: row.exam_version && !read.has(row.exam_version),
        cardHref: cardHref?.(row),
        noticeHref: modules.has('notices') && row.exam_version ? `/notices#notice-exam-slot-${row.exam_version}` : '',
      };
    });
  const months = Map.groupBy(upcoming, row => row.exam_date.slice(0, 7));
  return layout('Сессия', html`
    <main id="content" class="page narrow session">
      <a class="back-link" href="/grades">Ведомость</a>
      <header class="identity directory-title">
        <div><h1>Сессия</h1><p>Учебная дата · <time datetime="${today}">${formatDate(today)}</time></p></div>
        ${modules.has('calendar') ? html`<a class="button-link primary" href="/calendar?view=month&amp;kind=exam&amp;date=${upcoming[0]?.exam_date ?? today}">Календарь сессии</a>` : ''}
      </header>
      ${months.size ? Array.from(months, ([month, dates]) => {
        const name = monthName.format(new Date(`${month}-01T00:00:00Z`)).replace(/\s*г\.$/, '');
        return html`<section aria-labelledby="session-${month}">
          <h2 id="session-${month}">${name[0].toUpperCase() + name.slice(1)}</h2>
          <ul class="session-assessments" role="list">${dates.map(row => assessmentCard(row, today))}</ul>
        </section>`;
      }) : html`<p class="section-empty">В ближайшее время экзаменов и зачётов нет.</p>`}
    </main>`, { ...context, active: 'grades' });
}
