import { html } from 'hono/html';
import { datesInRange, weekLoad } from './calendar.js';
import { pluralRu } from '../ui/plural.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { calendarNavigation, weekNavigation } from '../ui/presentation.js';

const kindLabels = {
  lesson: ['Занятие', 'Пары', 'пара', 'пары', 'пар'],
  exam: ['Аттестация', 'Экзамены и зачёты', 'аттестация', 'аттестации', 'аттестаций'],
  deadline: ['Дедлайн', 'Дедлайны', 'дедлайн', 'дедлайна', 'дедлайнов'],
  'campus-event': ['Событие кампуса', 'События', 'событие кампуса', 'события кампуса', 'событий кампуса'],
  booking: ['Бронирование', 'Брони', 'бронь', 'брони', 'броней'],
  tuition: ['Оплата', 'Оплата', 'срок оплаты', 'срока оплаты', 'сроков оплаты'],
  consultation: ['Консультация', 'Консультации', 'консультация', 'консультации', 'консультаций'],
};
const weekday = new Intl.DateTimeFormat('ru', { weekday: 'long', timeZone: 'UTC' });
const shortWeekday = new Intl.DateTimeFormat('ru', { weekday: 'short', timeZone: 'UTC' });

function formatRange(from, to) {
  return from.slice(0, 7) === to.slice(0, 7)
    ? `${Number(from.slice(-2))}–${formatDate(to)}`
    : `${formatDate(from)} — ${formatDate(to)}`;
}

function eventRow(event) {
  return html`<div>
    <dt>
      <span class="schedule-time">${event.start
        ? html`<time datetime="${event.start}">${event.start}</time>
          ${event.end ? html`<span>до <time datetime="${event.end}">${event.end}</time></span>` : ''}
          <span>МСК</span>`
        : html`<span>Весь день</span>`}</span>
      <span>${event.href ? html`<a href="${event.href}">${event.title}</a>` : event.title}</span>
    </dt>
    <dd>
      <span class="calendar-event-kind">${event.label ?? kindLabels[event.kind]?.[0] ?? 'Событие'}</span>
      ${event.place ? html`<span class="notice-meta">${event.place}</span>` : ''}
      ${event.details ? html`<p class="hint">${event.details}</p>` : ''}
    </dd>
  </div>`;
}

const monthName = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const asDate = date => new Date(`${date}T00:00:00Z`);
const capitalize = text => text[0].toUpperCase() + text.slice(1);

function calendarHref(date, view, kinds, path = '/calendar') {
  const query = new URLSearchParams();
  if (date) query.set('date', date);
  if (view === 'month') query.set('view', view);
  if (kinds.length) query.set('kind', kinds.join(','));
  return query.size ? `${path}?${query}` : path;
}

function weekSummary(events, week) {
  const { byKind, total, busiest } = weekLoad(events, week);
  if (!total) return html`<p class="section-empty">На этой неделе событий нет.</p>`;
  const counts = [...byKind].map(([kind, count]) =>
    `${count} ${pluralRu(count, ...(kindLabels[kind]?.slice(2) ?? ['событие', 'события', 'событий']))}`);
  return html`<div class="calendar-summary">
    <p><strong>На неделе</strong> ${new Intl.ListFormat('ru').format(counts)}.</p>
    <p class="hint">Больше всего событий: <strong>${weekday.format(asDate(busiest.date))}, ${formatDate(busiest.date)}</strong>
      (${busiest.count} ${pluralRu(busiest.count, 'событие', 'события', 'событий')}).</p>
  </div>`;
}

function weekContent(week, events, days) {
  return html`
    ${weekSummary(events, week)}
    ${datesInRange(week).map(date => {
      const entries = days.get(date);
      return html`<section class="schedule-week-day calendar-day${entries ? '' : ' is-empty'}" aria-labelledby="day-${date}">
        <h2 id="day-${date}"><time datetime="${date}">${capitalize(weekday.format(asDate(date)))}, ${formatDate(date)}</time></h2>
        ${entries ? html`<dl>${entries.map(eventRow)}</dl>` : html`<p class="hint">Событий нет.</p>`}
      </section>`;
    })}`;
}

function monthContent(month, days, selected, today, kinds) {
  const activeMonth = [...days.keys()].some(day => day >= month.first && day <= month.last);
  return html`
    ${activeMonth ? '' : html`<p class="section-empty">В этом месяце событий нет.</p>`}
    <div class="calendar-month-weekdays" aria-hidden="true">
      ${datesInRange(month).slice(0, 7).map(date => html`<span>${shortWeekday.format(asDate(date))}</span>`)}
    </div>
    <ul class="calendar-month" role="list" aria-label="Дни месяца">
      ${datesInRange(month).map(date => {
        const entries = days.get(date) ?? [];
        const title = `${weekday.format(asDate(date))}, ${formatDate(date)}${date === today ? ', сегодня' : ''}`;
        const count = `${entries.length} ${pluralRu(entries.length, 'событие', 'события', 'событий')}`;
        const link = calendarHref(date, 'week', kinds);
        return html`<li class="calendar-month-cell${date < month.first || date > month.last ? ' is-adjacent' : ''}">
          <a href="${link}#day-${date}" aria-label="${title}. ${count}."
            ${date === selected ? html`aria-current="date"` : ''} ${date === today ? html`class="is-today"` : ''}>
            <time datetime="${date}">${Number(date.slice(-2))}</time>
            ${entries.slice(0, 2).map(event => html`<span class="calendar-month-event"
              title="${event.label ?? kindLabels[event.kind]?.[0] ?? 'Событие'}: ${event.title}">${event.label ?? kindLabels[event.kind]?.[0] ?? 'Событие'}: ${event.title}</span>`)}
            ${entries.length > 2 ? html`<span class="calendar-month-more">+${entries.length - 2}</span>` : ''}
          </a>
        </li>`;
      })}
    </ul>`;
}

function layerControls(layers, kinds, selected, view) {
  if (!layers.length) return '';
  return html`<nav class="section-links calendar-layers" aria-label="Слои календаря">
    <a href="${calendarHref(selected, view, [])}" ${!kinds.length ? html`aria-current="page"` : ''}>Всё</a>
    ${layers.map(kind => {
      const active = kinds.includes(kind);
      const next = active ? kinds.filter(value => value !== kind) : [...kinds, kind];
      return html`<a href="${calendarHref(selected, view, next)}" ${active ? html`aria-current="page"` : ''}>${kindLabels[kind][1]}</a>`;
    })}
  </nav>`;
}

export function calendarPage({ view, selected, today, week, month, layers, kinds, events, student, csrf, description, scheduleHref, canExport, deadlineForm, deadlineAdded }) {
  const days = Map.groupBy(events, event => event.date);
  const session = kinds.length === 1 && kinds[0] === 'exam';
  const title = session ? 'Календарь сессии' : 'Личный календарь';
  const range = month ?? week;
  const term = month ? 'месяц' : 'неделя';
  const current = month ? today >= month.first && today <= month.last : week.from === week.current;
  const rangeTitle = month ? capitalize(monthName.format(asDate(month.first)).replace(/\s*г\.$/, '')) : formatRange(week.from, week.to);
  return layout(title, html`
    <main id="content" class="page schedule calendar">
      <header class="identity directory-title">
        <div><h1>${title}</h1>
          ${session ? html`<p class="hint">Ваши предстоящие экзамены и зачёты.</p>` : description ? html`<p class="hint">${description}</p>` : ''}
        </div>
        ${session ? html`<a class="button-link secondary" href="/grades/session">Список аттестаций</a>` : scheduleHref ? html`<a class="button-link secondary design-week-link" href="${scheduleHref}">Только пары группы</a>` : ''}
      </header>
      ${weekNavigation('calendar', scheduleHref, calendarHref(selected, view, kinds))}
      <nav class="section-links calendar-view" aria-label="Вид календаря">
        <a href="${calendarHref(selected, 'week', kinds)}" ${!month ? html`aria-current="page"` : ''}>Неделя</a>
        <a href="${calendarHref(selected, 'month', kinds)}" ${month ? html`aria-current="page"` : ''}>Месяц</a>
      </nav>
      ${layerControls(layers, kinds, selected, view)}
      ${deadlineAdded ? html`<p class="status-pill is-ready" role="status">Дедлайн добавлен в календарь</p>` : ''}
      ${deadlineForm && !session ? html`<div class="design-calendar-deadlines" hidden>
        <details class="today-panel">
          <summary>Добавить дедлайн</summary>
          ${deadlineForm}
        </details>
        <a class="back-link" href="/deadlines">Управление дедлайнами</a>
      </div>` : ''}
      <nav aria-label="Переходы по периоду">
        <h2>${rangeTitle}</h2>
        <div class="schedule-actions">
          ${range.previous ? html`<a href="${calendarHref(range.previous, view, kinds)}">${month ? 'Предыдущий' : 'Предыдущая'} ${term}</a>` : ''}
          <a href="${calendarHref(month ? today : null, view, kinds)}"${current ? html` aria-current="page"` : ''}>${month ? 'Текущий' : 'Текущая'} ${term}</a>
          ${range.next ? html`<a href="${calendarHref(range.next, view, kinds)}">${month ? 'Следующий' : 'Следующая'} ${term}</a>` : ''}
          ${canExport && !month ? html`<a href="${calendarHref(week.from, 'week', kinds, '/calendar/export.ics')}">Скачать .ics</a>` : ''}
        </div>
        ${!month ? calendarNavigation(datesInRange(week).map(day => ({
          date: day, weekday: shortWeekday.format(asDate(day)), number: Number(day.slice(-2)), count: days.get(day)?.length ?? 0,
        }))) : ''}
      </nav>
      ${month ? monthContent(month, days, selected, today, kinds) : weekContent(week, events, days)}
    </main>`, { student, csrf, active: 'calendar' });
}
