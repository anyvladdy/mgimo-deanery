import { Hono } from 'hono';
import { html } from 'hono/html';
import { dateFilter, officeDateInput } from '../ui/date-input.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { timetableForStudent } from './timetable.js';

const serviceNames = { campus: 'Шаттл до общежития 1', dubki: 'Дубовозка' };

function directionCard({ stops, departures, next }, today) {
  const direction = `${stops[0]} → ${stops.at(-1)}`;
  return html`<section aria-label="${direction}">
    <h3>${direction}</h3>
    <details class="plan-history">
      <summary>Остановки</summary>
      <ol>${stops.map(stop => html`<li>${stop}</li>`)}</ol>
    </details>
    <h4>Отправления</h4>
    ${departures.length
      ? html`<p>${departures.map((time, index) => html`${index ? ' · ' : ''}<time datetime="${time}">${time}</time>`)} МСК</p>`
      : html`<p class="section-empty">На этот день рейсов нет.</p>`}
    ${next ? html`<p><strong class="status-pill is-ready">Ближайший рейс ·
      <time datetime="${next.date}T${next.time}:00+03:00">${next.date === today ? '' : html`${formatDate(next.date)} · `}${next.time}</time> МСК
    </strong></p>` : ''}
  </section>`;
}

function shuttlePage({ date, dateInput, dateError, today, kind, services, student, csrf }) {
  const groups = Object.entries(services);
  return layout('Шаттлы', html`
    <main class="page" id="content">
      <header class="identity"><h1>Шаттлы</h1></header>
      <form class="directory-filter" method="get" action="/shuttles">
        <div class="office-date-filter-field">${officeDateInput('shuttles-date', 'Дата поездки', dateInput, dateError)}</div>
        <button class="secondary">Показать</button>
        ${date !== today ? html`<a class="button-link secondary" href="/shuttles">Сегодня</a>` : ''}
      </form>
      <p class="hint"><time datetime="${date}">${formatDate(date)}</time> · ${kind === 'weekend' ? 'Выходной день' : 'Будний день'}</p>
      ${groups.length ? groups.map(([service, directions]) => html`
        <section aria-labelledby="${service}-title">
          <h2 id="${service}-title">${serviceNames[service]}</h2>
          <div class="request-actions">${directions.map(route => directionCard(route, today))}</div>
        </section>`) : html`<p class="section-empty">Расписание шаттлов пока недоступно.</p>`}
    </main>`, { student, csrf, active: 'shuttles' });
}

export function shuttleRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  routes.get('/', c => {
    const now = currentSchoolDay();
    const selection = dateFilter(c.req.query('date'), now.date);
    const { date } = selection;
    const timetable = timetableForStudent(db, c.get('studentId'), date, now);
    return c.html(shuttlePage({
      ...selection, today: now.date, ...timetable, student: c.get('student'), csrf: c.get('csrfToken'),
    }));
  });
  return routes;
}
