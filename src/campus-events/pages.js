import { html } from 'hono/html';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { registrationOpen } from './events.js';

function eventTime(event) {
  const start = html`<time datetime="${event.event_date}T${event.starts_at}:00+03:00">${event.starts_at}</time>`;
  const end = event.ends_at
    ? html`–<time datetime="${event.event_date}T${event.ends_at}:00+03:00">${event.ends_at}</time>` : '';
  return html`<time datetime="${event.event_date}">${formatDate(event.event_date)}</time>
    <span class="event-time">${end ? '' : 'в '}${start}${end}&nbsp;МСК</span>`;
}

function status(event, open, showAvailability = false) {
  if (event.registered) return html`<span class="status-pill is-ready">Участие подтверждено</span>`;
  if (!open) return html`<span class="status-pill">Запись закрыта</span>`;
  return showAvailability ? html`<span class="status-pill">Запись открыта</span>` : '';
}

function registrationForm(event, csrf, inCatalog) {
  const action = event.registered ? 'cancel' : 'register';
  const label = event.registered ? 'Отменить запись' : 'Записаться';
  return html`<form class="${inCatalog ? 'event-catalog-action' : 'event-registration'}" method="post" action="/events/${event.id}/${action}">
    <input type="hidden" name="_csrf" value="${csrf}">
    ${inCatalog ? html`<input type="hidden" name="view" value="catalog">` : ''}
    <button class="${event.registered ? 'secondary' : 'primary'}"
      ${inCatalog ? html`aria-label="${label} · ${event.title}"` : ''}>${label}</button>
  </form>`;
}

export function eventsPage(events, schoolDay, options, cancelled) {
  return layout('События кампуса', html`
    <main id="content" class="page">
      <header class="identity"><h1>События кампуса</h1></header>
      ${events.length ? html`<ul class="office-records notice-list" role="list">
        ${events.map(event => {
          const open = registrationOpen(event, schoolDay);
          return html`<li id="event-${event.id}" class="request-target" tabindex="-1">
            <div>
              <div class="notice-meta"><span class="hint">${eventTime(event)}</span>${status(event, open)}</div>
              <h2><a href="/events/${event.id}">${event.title}</a></h2>
              <p>${event.place}</p>
              ${!event.registered && cancelled === String(event.id) ? html`<p role="status">Запись отменена.</p>` : ''}
            </div>
            ${open ? registrationForm(event, options.csrf, true) : ''}
          </li>`;
        })}
      </ul>` : html`<p class="section-empty">Доступных событий пока нет.</p>`}
    </main>`, options);
}

export function eventPage(event, schoolDay, options, { closed = false, cancelled = false } = {}) {
  const open = registrationOpen(event, schoolDay);
  return layout(event.title, html`
    <main id="content" class="page narrow">
      <nav class="section-links" aria-label="События кампуса"><a href="/events">Все события</a></nav>
      <header class="identity"><h1>${event.title}</h1></header>
      <section class="today-panel" aria-label="Время и место события">
        <p><strong>${eventTime(event)}</strong></p>
        <p>${event.place}</p>
        <p class="review-comment">${event.description}</p>
        ${status(event, open, true)}
        ${cancelled ? html`<p role="status">Запись отменена.</p>` : ''}
        ${closed ? html`<p class="error" role="alert">Событие уже началось. Изменить запись нельзя.</p>` : ''}
        ${open ? registrationForm(event, options.csrf, false) : ''}
      </section>
    </main>`, options);
}
