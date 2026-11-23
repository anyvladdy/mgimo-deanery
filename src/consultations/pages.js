import { html } from 'hono/html';
import { officeDateInput } from '../ui/date-input.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { pluralRu } from '../ui/plural.js';

function slotInfo(slot) {
  return html`<p><time datetime="${slot.slot_date}">${formatDate(slot.slot_date)}</time>
    · ${slot.starts_at}–${slot.ends_at} МСК · ${slot.mode === 'online' ? 'Онлайн' : `ауд. ${slot.room}`}</p>`;
}

export function studentPage({ slots, contacts, feedback, context }) {
  return layout('Консультации', html`
    <main id="content" class="page narrow">
      <header class="identity"><h1>Консультации</h1></header>
      ${feedback.error && !feedback.id ? html`<p class="error" role="alert">${feedback.error}</p>` : ''}
      ${slots.length ? html`<ul class="session-assessments" role="list">${slots.map(slot => {
        const booked = slot.booked_topic != null;
        const seats = slot.capacity - slot.taken;
        const error = feedback.id === slot.id ? feedback.error : '';
        return html`<li class="today-panel" id="consultation-${slot.id}">
          <header class="directory-title">
            <div><h2>${slot.subject}</h2><p class="hint">${slot.teacher}</p></div>
            <span class="status-pill${booked ? ' is-ready' : ''}">${booked ? 'Вы записаны' : seats
              ? `Свободно ${seats} ${pluralRu(seats, 'место', 'места', 'мест')}` : 'Мест нет'}</span>
          </header>
          ${slotInfo(slot)}
          ${slot.note ? html`<p>${slot.note}</p>` : ''}
          ${feedback.cancelled === slot.id && !booked ? html`<p role="status">Запись отменена.</p>` : ''}
          ${feedback.booked === slot.id && booked ? html`<p role="status">Запись подтверждена.</p>` : ''}
          ${error ? html`<p class="error" id="topic-error-${slot.id}" role="alert">${error}</p>` : ''}
          ${booked ? html`<p>Тема встречи: ${slot.booked_topic}</p>
            <div class="office-buttons">
              ${contacts.get(slot.staff_id)?.includes(slot.subject)
                ? html`<a class="button-link secondary" href="/messages/new?consultation=${slot.id}">Написать преподавателю</a>` : ''}
              <form method="post" action="/consultations/${slot.id}/cancel">
                <input type="hidden" name="_csrf" value="${context.csrf}">
                <button class="secondary">Отменить запись</button>
              </form>
            </div>`
            : seats ? html`<form class="form-panel" method="post" action="/consultations/${slot.id}/book" autocomplete="off">
              <input type="hidden" name="_csrf" value="${context.csrf}">
              <label for="topic-${slot.id}">Тема встречи</label>
              <input id="topic-${slot.id}" name="topic" type="text" required maxlength="200"
                value="${feedback.id === slot.id ? feedback.topic ?? '' : ''}"
                ${error ? html`aria-invalid="true" aria-describedby="topic-error-${slot.id}" autofocus` : ''}>
              <button class="primary">Записаться</button>
            </form>` : ''}
        </li>`;
      })}</ul>` : html`<p class="section-empty">Пока нет доступных консультаций.</p>`}
    </main>`, context);
}

function publicationForm(options, input, errors, csrf) {
  const { teacher, courses, groups, teachers } = options;
  const firstError = Object.keys(errors)[0];
  const errorText = name => errors[name] ? html`<p class="error" role="alert" id="consultation-error-${name}">${errors[name]}</p>` : '';
  const errorProps = name => errors[name] ? html`aria-invalid="true" aria-describedby="consultation-error-${name}"
    ${name === firstError ? 'autofocus' : ''}` : '';
  const opts = (name, choices) => choices.map(([value, label]) => html`
    <option value="${value}" ${String(value) === input[name] ? 'selected' : ''}>${label}</option>`);
  const select = (name, label, choices, required = true) => html`
    <label for="consultation-${name}">${label}</label>
    <select id="consultation-${name}" name="${name}" ${required ? 'required' : ''} ${errorProps(name)}>${opts(name, choices)}</select>
    ${errorText(name)}`;
  const text = (name, label, size, extra = '', required = true) => html`
    <label for="consultation-${name}">${label}</label>
    <input id="consultation-${name}" name="${name}" type="text" maxlength="${size}" value="${input[name] ?? ''}"
      ${required ? 'required' : ''} ${errorProps(name)} ${extra}>
    ${errorText(name)}`;
  if (teacher ? !courses.length : !teachers.length) {
    return html`<p class="section-empty">${teacher ? 'Учебный офис пока не назначил вам дисциплины.'
      : 'Добавьте действующую учётную запись преподавателя, чтобы публиковать встречи.'}</p>`;
  }
  return html`<form class="form-panel" method="post" action="/office/consultations" autocomplete="off">
    <input type="hidden" name="_csrf" value="${csrf}">
    ${teacher ? select('subject', 'Дисциплина', [['', 'Выберите дисциплину'],
      ...[...new Set(courses.map(course => course.subject))].map(subject => [subject, subject])])
      : [
        select('teacher', 'Преподаватель', [['', 'Выберите преподавателя'], ...teachers.map(row => [row.id, row.full_name])]),
        text('subject', 'Дисциплина', 240),
      ]}
    ${select('group', 'Группа', [
      ['', teacher ? 'Выберите группу' : 'Все студенты, у которых дисциплина в плане'],
      ...(teacher ? [...new Set(courses.map(course => course.group_code))] : groups).map(group => [group, group]),
    ], teacher)}
    ${officeDateInput('consultation-date', 'Дата встречи', input.date, errors.date, { autofocus: firstError === 'date' })}
    ${text('start', 'Начало, ЧЧ:ММ МСК', 5)}
    ${text('end', 'Окончание, ЧЧ:ММ МСК', 5)}
    ${select('mode', 'Формат', [['offline', 'В аудитории'], ['online', 'Онлайн']])}
    ${text('room', 'Аудитория (для очной встречи)', 80, '', false)}
    ${text('capacity', 'Число мест', 2, html`inputmode="numeric"`)}
    ${text('note', 'Примечание (необязательно)', 500, '', false)}
    <button class="primary">Опубликовать консультацию</button>
  </form>`;
}

export function staffPage({ slots, options, input, errors, context, saved, cancelled }) {
  return layout('Консультации', html`
    <main id="content" class="page narrow">
      <header class="identity"><h1>Консультации</h1></header>
      ${saved && slots.some(slot => slot.id === saved && !slot.cancelled_at) ? html`<p role="status">Консультация опубликована.</p>` : ''}
      ${cancelled && slots.some(slot => slot.id === cancelled && slot.cancelled_at) ? html`<p role="status">Консультация отменена.</p>` : ''}
      <section aria-labelledby="new-consultation"><h2 id="new-consultation">Новая консультация</h2>
        ${publicationForm(options, input, errors, context.csrf)}</section>
      <section aria-labelledby="consultation-slots"><h2 id="consultation-slots">Опубликованные встречи</h2>
        ${slots.length ? html`<ul class="office-records" role="list">${slots.map(slot => html`
          <li id="office-consultation-${slot.id}">
            <div><h3>${slot.subject}</h3>
              <p class="hint">${slot.teacher}${slot.group_code ? ` · ${slot.group_code}` : ''}</p>
              ${slotInfo(slot)}
              <p>Записались ${slot.taken} из ${slot.capacity}</p>
            </div>
            ${slot.cancelled_at ? html`<span class="status-pill">Отменена</span>` : slot.upcoming ? html`
              <form method="post" action="/office/consultations/${slot.id}/cancel">
                <input type="hidden" name="_csrf" value="${context.csrf}"><button class="secondary">Отменить встречу</button>
              </form>` : ''}
          </li>`)}</ul>` : html`<p class="section-empty">Опубликованных встреч пока нет.</p>`}
      </section>
    </main>`, context);
}
