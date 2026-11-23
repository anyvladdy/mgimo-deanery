import { html } from 'hono/html';
import { officeDateInput } from '../ui/date-input.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { pluralRu } from '../ui/plural.js';
import { bookingTimes, bookingUrl, purposeLimit } from './bookings.js';

const interval = ({ starts_at, ends_at }) =>
  html`<time datetime="${starts_at}">${starts_at}</time>–<time datetime="${ends_at}">${ends_at}</time>`;

function timeOptions(times, selected) {
  return times.map(time => html`<option value="${time}" ${time === selected ? 'selected' : ''}>${time}</option>`);
}

function bookingForm(date, room, csrf, values, error) {
  const purpose = typeof values.purpose === 'string' ? values.purpose.slice(0, purposeLimit) : '';
  return html`<form class="form-panel" method="post" action="/room-booking" aria-labelledby="create-booking-title">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="hidden" name="room" value="${room.code}">
    <input type="hidden" name="date" value="${date}">
    ${error ? html`<p class="error" id="booking-error" role="alert" tabindex="-1" autofocus>${error}</p>` : ''}
    <p class="hint" id="booking-window">С 08:00 до 20:00 МСК, до двух часов с шагом в 30 минут.</p>
    <label for="booking-start">Начало</label>
    <select name="start" id="booking-start" required aria-describedby="booking-window">
      <option value="">Выберите время</option>
      ${timeOptions(bookingTimes.slice(0, -1), values.start)}
    </select>
    <label for="booking-end">Окончание</label>
    <select name="end" id="booking-end" required aria-describedby="booking-window">
      <option value="">Выберите время</option>
      ${timeOptions(bookingTimes.slice(1), values.end)}
    </select>
    <label for="booking-purpose">Цель</label>
    <input type="text" id="booking-purpose" name="purpose" required maxlength="${purposeLimit}"
      value="${purpose}" aria-describedby="booking-purpose-limit">
    <p class="hint" id="booking-purpose-limit">До ${purposeLimit} знаков.</p>
    <button class="primary">Забронировать</button>
  </form>`;
}

function occupancyList(occupied, csrf) {
  return html`<ul class="office-records" role="list">
    ${occupied.map(item => item.id ? html`<li id="booking-${item.id}">
      <div><strong>${interval(item)}</strong><p class="review-comment">${item.purpose}</p></div>
      <form method="post" action="/room-booking/${item.id}/cancel">
        <input type="hidden" name="_csrf" value="${csrf}">
        <button class="secondary" aria-label="Отменить бронь с ${item.starts_at} до ${item.ends_at}">Отменить бронь</button>
      </form>
    </li>` : html`<li>
      <div><strong>${interval(item)}</strong></div>
      <span class="status-pill">${item.lesson ? 'Занято занятиями' : 'Занято'}</span>
    </li>`)}
  </ul>`;
}

export function roomBookingPage({ date, dateInput, dateError, today, availableRooms, room, availability, values, error, notice, csrf, student }) {
  const past = date < today;
  const roomsByBuilding = Object.groupBy(availableRooms, item => item.building);
  return layout('Бронь аудиторий', html`
    <main class="page" id="content">
      <header class="identity"><h1>Бронь аудиторий</h1></header>
      <form class="directory-filter" method="get" action="/room-booking">
        ${room ? html`<input type="hidden" name="room" value="${room.code}">` : ''}
        <div class="office-date-filter-field">${officeDateInput('room-booking-date', 'Дата бронирования', dateInput, dateError)}</div>
        <button class="secondary">Показать</button>
        ${room && date !== today ? html`<a class="button-link secondary" href="${bookingUrl(room.code, today)}">Сегодня</a>` : ''}
      </form>
      ${room ? html`
        <nav class="section-links" aria-label="Корпуса">
          ${Object.entries(roomsByBuilding).map(([building, items]) => html`<a href="${bookingUrl(items[0].code, date)}"
            ${building === room.building ? html`aria-current="page"` : ''}>${building}</a>`)}
        </nav>
        <nav class="section-links" aria-label="Аудитории">
          ${roomsByBuilding[room.building].map(item => html`<a href="${bookingUrl(item.code, date)}"
            ${item.code === room.code ? html`aria-current="page"` : ''}>Ауд. ${item.code} · ${item.capacity} ${pluralRu(item.capacity, 'место', 'места', 'мест')}</a>`)}
        </nav>
        <header class="identity">
          <h2>Аудитория ${room.code}</h2>
          <p class="hint">${room.building} · <time datetime="${date}">${formatDate(date)}</time> · МСК</p>
        </header>
        ${notice ? html`<p class="status-pill is-ready" role="status">${notice}</p>` : ''}
        ${past && error ? html`<p class="error" role="alert" tabindex="-1" autofocus>${error}</p>` : ''}
        <div class="request-actions">
          <section aria-labelledby="room-availability-title">
            <h3 id="room-availability-title">${past ? 'Занятость' : 'Свободное время'}</h3>
            ${past ? html`<p class="hint">Выбранная дата прошла.</p>` : availability.free.length ? html`<ul class="office-records" role="list">
              ${availability.free.map(item => html`<li><strong>${interval(item)}</strong></li>`)}
            </ul>` : html`<p class="section-empty">Свободных интервалов нет.</p>`}
            ${availability.occupied.length ? html`${past ? '' : html`<h3>Занято</h3>`}${occupancyList(availability.occupied, csrf)}` : ''}
          </section>
          ${!past && (availability.free.length || error) ? html`<section aria-labelledby="create-booking-title">
            <h3 id="create-booking-title">Забронировать время</h3>
            ${bookingForm(date, room, csrf, values, error)}
          </section>` : ''}
        </div>` : html`<p class="section-empty">Пока нет аудиторий для бронирования.</p>`}
    </main>`, { student, csrf, active: 'room-booking' });
}
