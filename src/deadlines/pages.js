import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { officeDateInput } from '../ui/date-input.js';
import { formatDate } from '../ui/format.js';
import { pluralRu } from '../ui/plural.js';
import { deadlineWeek, deadlinePassed, timePattern, titleLimit } from './deadlines.js';

function action(deadline, csrf, name, label, style) {
  return html`<form method="post" action="/deadlines/${deadline.id}/${name}">
    <input type="hidden" name="_csrf" value="${csrf}">
    <button class="${style}" aria-label="${label} · ${deadline.title}">${label}</button>
  </form>`;
}

function deadlineList(deadlines, now, csrf, empty) {
  if (!deadlines.length) return html`<p class="section-empty">${empty}</p>`;
  return html`<ul class="office-records notice-list" role="list">${deadlines.map(deadline => html`
    <li id="deadline-${deadline.id}" class="request-target" tabindex="-1">
      <div>
        <div class="notice-meta">
          <span class="hint">${deadline.personal ? 'Личный дедлайн' : 'Учебное напоминание'}</span>
          ${!deadline.completed_at && deadlinePassed(deadline.due_date, deadline.due_time, now) ? html`<span class="status-pill is-warning">Срок истёк</span>` : ''}
        </div>
        <h3 class="review-comment">${deadline.title}</h3>
        <p>Срок ${deadline.due_time
          ? html`<time datetime="${deadline.due_date}T${deadline.due_time}:00+03:00">${formatDate(deadline.due_date)} · ${deadline.due_time} МСК</time>`
          : html`<time datetime="${deadline.due_date}">${formatDate(deadline.due_date)}</time>`}</p>
      </div>
      <div class="office-buttons">
        ${!deadline.completed_at ? action(deadline, csrf, 'complete', 'Отметить выполненным', 'primary') : ''}
        ${deadline.personal ? action(deadline, csrf, 'delete', 'Удалить', 'secondary') : ''}
      </div>
    </li>`)}</ul>`;
}

export function deadlineForm(csrf, fields = {}, errors = {}, { fromCalendar = false } = {}) {
  return html`<form class="form-panel" method="post" action="/deadlines">
      <input type="hidden" name="_csrf" value="${csrf}">
      ${fromCalendar ? html`<input type="hidden" name="source" value="calendar">` : ''}
      <label for="deadline-title">Название</label>
      <input id="deadline-title" name="title" type="text" value="${fields.title ?? ''}" required maxlength="${titleLimit}"
        ${errors.title ? html`aria-invalid="true" aria-describedby="deadline-title-error" ${!errors.date ? 'autofocus' : ''}` : ''}>
      ${errors.title ? html`<p class="error" id="deadline-title-error" role="alert">${errors.title}</p>` : ''}
      ${officeDateInput('deadline-date', 'Срок', fields.date, errors.date)}
      <label for="deadline-time">Время · МСК</label>
      <input id="deadline-time" name="time" type="text" value="${fields.time ?? ''}" maxlength="5" pattern="${timePattern}"
        aria-describedby="${errors.time ? 'deadline-time-hint deadline-time-error' : 'deadline-time-hint'}"
        ${errors.time ? html`aria-invalid="true" ${!errors.date && !errors.title ? 'autofocus' : ''}` : ''}>
      <p class="hint" id="deadline-time-hint">ЧЧ:ММ. Оставьте пустым, если срок до конца дня.</p>
      ${errors.time ? html`<p class="error" id="deadline-time-error" role="alert">${errors.time}</p>` : ''}
      <button class="primary">Добавить дедлайн</button>
    </form>`;
}

function upcomingStrip(days, selected) {
  return html`<section aria-labelledby="deadline-week-title">
    <h2 id="deadline-week-title">Открытые дедлайны на 7 дней</h2>
    <p class="hint">Сегодня — ${formatDate(days[0].date)}, завтра — ${formatDate(days[1].date)}.</p>
    <ul class="week-picker deadline-strip" role="list">${days.map(({ date, count }, index) => {
      const label = `${index === 0 ? 'Сегодня, ' : index === 1 ? 'Завтра, ' : ''}${formatDate(date)}. ${count} ${pluralRu(count, 'дедлайн', 'дедлайна', 'дедлайнов')}`;
      return html`<li><a href="/deadlines?date=${date}#open-deadlines-title" aria-label="${label}"
        ${selected === date ? html`aria-current="date"` : ''} ${index === 0 ? html`class="is-today"` : ''}>
        <time datetime="${date}">${Number(date.slice(-2))}</time><strong>${count}</strong>
      </a></li>`;
    })}</ul>
  </section>`;
}

export function deadlinesPage(deadlines, now, options, fields = {}, errors = {}) {
  const open = deadlines.filter(deadline => !deadline.completed_at);
  const days = deadlineWeek(open, now.date);
  const selected = days.some(day => day.date === options.date) ? options.date : '';
  const visible = selected ? open.filter(deadline => deadline.due_date === selected) : open;
  const completed = deadlines.filter(deadline => deadline.completed_at);
  return layout('Дедлайны', html`
    <main id="content" class="page requests deadlines">
      <header class="identity"><h1>Дедлайны</h1></header>
      ${options.fromCalendar ? html`<a class="back-link" href="/calendar?kind=deadline">К дедлайнам в календаре</a>` : ''}
      ${upcomingStrip(days, selected)}
      <section class="request-progress" aria-labelledby="new-deadline-title">
        <h2 id="new-deadline-title">Новый дедлайн</h2>
        ${deadlineForm(options.csrf, fields, errors, options)}
      </section>
      <section aria-labelledby="open-deadlines-title">
        <h2 id="open-deadlines-title">${selected ? `Открытые на ${formatDate(selected)}` : 'Открытые'}</h2>
        ${selected ? html`<a class="back-link" href="/deadlines#open-deadlines-title">Все открытые дедлайны</a>` : ''}
        ${deadlineList(visible, now, options.csrf, selected ? 'На этот день открытых дедлайнов нет.' : 'Открытых дедлайнов нет.')}
      </section>
      <section aria-labelledby="completed-deadlines-title">
        <h2 id="completed-deadlines-title">Выполненные</h2>
        ${deadlineList(completed, now, options.csrf, 'Выполненных дедлайнов пока нет.')}
      </section>
    </main>`, options);
}
