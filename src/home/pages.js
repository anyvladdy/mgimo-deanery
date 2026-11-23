import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { demoDate } from '../schedule/schedule.js';

const months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function formatDay(date) {
  const value = new Date(`${date}T00:00:00Z`);
  return `${weekdays[value.getUTCDay()]}, ${value.getUTCDate()} ${months[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

function otherLesson(lesson) {
  return html`
    <div>
      <dt><time datetime="${lesson.starts_at}">${lesson.starts_at}</time> · ${lesson.subject}</dt>
      <dd>${lesson.teacher} · ауд. ${lesson.current_room}${lesson.change_id !== null
        ? html` · <span class="room-old">Было ${lesson.scheduled_room}</span>` : ''}</dd>
    </div>`;
}

export function homePage({ student, lessons, csrf }) {
  const nearest = lessons[0];
  const changed = nearest?.change_id !== null && nearest?.change_id !== undefined;
  const unread = changed && !nearest.is_read;
  return layout('Сегодня', html`
    <main id="content" class="page today">
      <header class="today-head">
        <p class="eyebrow">Учебный день · ${formatDay(demoDate)}</p>
        <h1>Сегодня</h1>
        <p>${student.full_name}, вот ближайшая пара и её актуальная аудитория.</p>
      </header>
      ${nearest
        ? html`<article class="next-lesson">
            <p class="lesson-time">${nearest.starts_at}<span> · до ${nearest.ends_at}</span></p>
            <h2 class="lesson-subject">${nearest.subject}</h2>
            <p class="lesson-teacher">${nearest.teacher}</p>
            <p class="room">Аудитория ${nearest.current_room}${changed && unread
              ? html` · <span class="room-old">Было ${nearest.scheduled_room}</span>` : ''}</p>
            <div class="read-form">
              <a class="button-link primary" href="/schedule?date=${demoDate}#lesson-${nearest.lesson_id}">Открыть расписание</a>
              ${changed && unread
                ? html`<form method="post" action="/read/${nearest.change_id}">
                    <input type="hidden" name="_csrf" value="${csrf}">
                    <button class="secondary">Прочитано</button>
                  </form>`
                : changed ? html`<p class="state">Перенос отмечен прочитанным</p>` : ''}
            </div>
          </article>`
        : html`<p class="day-empty">На этот учебный день пар нет. <a href="/schedule">Открыть расписание</a>.</p>`}
      ${lessons.length > 1
        ? html`<section class="lesson-list">
            <h2>Ещё сегодня</h2>
            <dl>${lessons.slice(1).map(lesson => otherLesson(lesson))}</dl>
          </section>`
        : ''}
    </main>`, { student, csrf, active: 'today' });
}
