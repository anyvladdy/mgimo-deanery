import { html } from 'hono/html';
import { isDate } from '../modules/clock.js';

export function parseOfficeDate(value) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (isDate(input)) return input;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(input) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(input);
  if (!match) return '';
  const [, day, month, year] = match;
  const date = `${year}-${month}-${day}`;
  return isDate(date) ? date : '';
}

export function dateFilter(value, today) {
  const parsed = parseOfficeDate(value);
  const date = parsed || today;
  const invalid = typeof value === 'string' && !parsed;
  return {
    date,
    dateInput: invalid ? value.slice(0, 10) : date,
    dateError: invalid ? 'Введите существующую дату.' : '',
  };
}

export function officeDateInput(id, label, value = '', error = '', { autofocus = true } = {}) {
  const display = isDate(value) ? value.split('-').reverse().join('.') : value;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return html`
    <label for="${id}">${label} · ДД.ММ.ГГГГ</label>
    <input id="${id}" type="text" name="date" value="${display}" inputmode="numeric" maxlength="10"
      aria-describedby="${error ? `${hintId} ${errorId}` : hintId}" required
      ${error ? html`aria-invalid="true" ${autofocus ? 'autofocus' : ''}` : ''}>
    <p class="hint" id="${hintId}">Можно ввести 8 цифр подряд.</p>
    ${error ? html`<p class="error" id="${errorId}" role="alert">${error}</p>` : ''}`;
}
