import { html } from 'hono/html';
import { isDate, parseTimestamp, schoolDayAt } from '../modules/clock.js';

const dateFormatter = new Intl.DateTimeFormat('ru', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});

function formatCalendarDate(date) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`)).replace(/\s*г\.$/, '');
}

export function formatDate(value) {
  if (isDate(value)) return formatCalendarDate(value);
  const instant = parseTimestamp(value);
  return Number.isNaN(instant.getTime()) ? String(value ?? '') : formatCalendarDate(schoolDayAt(instant).date);
}

export function timestamp(value) {
  const instant = parseTimestamp(value);
  if (Number.isNaN(instant.getTime())) return String(value ?? '');
  const { date, time } = schoolDayAt(instant);
  return html`<time datetime="${instant.toISOString()}">${formatCalendarDate(date)} · ${time.slice(0, 5)} МСК</time>`;
}
