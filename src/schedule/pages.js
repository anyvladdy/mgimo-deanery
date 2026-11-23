import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { demoDate, shiftDate } from './schedule.js';

const months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function parts(date) {
  return new Date(`${date}T00:00:00Z`);
}

function formatDate(date) {
  const value = parts(date);
  return `${value.getUTCDate()} ${months[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

function formatDay(date) {
  return `${weekdays[parts(date).getUTCDay()]}, ${formatDate(date)}`;
}

function lessonContent(lesson) {
  const changed = lesson.change_id !== null;
  return html`
    <dt><time datetime="${lesson.starts_at}">${lesson.starts_at}</time> · ${lesson.subject}</dt>
    <dd>${lesson.teacher} · ауд. ${lesson.current_room}${changed
      ? html` · <span>Было ${lesson.scheduled_room}</span>` : ''}</dd>`;
}

function lessonRow(lesson) {
  return html`<div id="lesson-${lesson.lesson_id}">${lessonContent(lesson)}</div>`;
}

function dayLessonRow(lesson) {
  return html`<div>${lessonContent(lesson)}</div>`;
}

function weekDays(week) {
  const days = [];
  for (const lesson of week) {
    let day = days.find(item => item.date === lesson.lesson_date);
    if (!day) {
      day = { date: lesson.lesson_date, lessons: [] };
      days.push(day);
    }
    day.lessons.push(lesson);
  }
  return days;
}

export function schedulePage({ date, weekStart, lessons, week, student, csrf }) {
  const days = weekDays(week);
  const isDemoDate = date === demoDate;
  return layout('Расписание', html`
    <main id="content" class="page schedule">
      <header class="identity">
        <p class="eyebrow">Учебная неделя</p>
        <h1>Расписание</h1>
      </header>
      <p>${isDemoDate
        ? `Учебная дата — ${formatDate(demoDate)}.`
        : `Выбранная дата — ${formatDate(date)}. Учебная дата — ${formatDate(demoDate)}.`}</p>
      <nav aria-label="Переходы по датам">
        <p><a href="?date=${date}#day">День</a> · <a href="?date=${date}#week">Неделя</a></p>
        <p>
          <a href="?date=${shiftDate(date, -1)}#day">Предыдущий день</a> ·
          <a href="?date=${shiftDate(date, 1)}#day">Следующий день</a> ·
          <a href="?date=${demoDate}#day">Вернуться к учебной дате</a>
        </p>
      </nav>

      <section id="day" aria-labelledby="day-title">
        <h2 id="day-title">${formatDay(date)}</h2>
        ${lessons.length
          ? html`<dl>${lessons.map(dayLessonRow)}</dl>`
          : html`<p>В этот день пар нет.</p>`}
      </section>

      <section id="week" aria-labelledby="week-title">
        <h2 id="week-title">Неделя с ${formatDate(weekStart)}</h2>
        ${days.length
          ? days.map(day => html`
            <section aria-labelledby="weekday-${day.date}">
              <h3 id="weekday-${day.date}"><a href="?date=${day.date}#day">${formatDay(day.date)}</a></h3>
              <dl>${day.lessons.map(lessonRow)}</dl>
            </section>`)
          : html`<p>На этой неделе пар нет.</p>`}
      </section>

      <p><a href="/">Открыть «Сегодня»</a></p>
    </main>`, { student, csrf, active: 'schedule' });
}
