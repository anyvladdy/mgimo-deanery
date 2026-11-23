import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';
import { pendingAssessmentHref } from '../grades/grades.js';

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
      <dt><time datetime="${lesson.starts_at}">${lesson.starts_at}</time> ·
        <a href="/schedule?date=${lesson.lesson_date}#lesson-${lesson.lesson_id}">${lesson.subject}</a></dt>
      <dd>${lesson.teacher} · ауд. ${lesson.current_room}${lesson.change_id !== null
        ? html` · <span class="room-old">Было ${lesson.scheduled_room}</span>` : ''}</dd>
    </div>`;
}

export function homePage({ student, date, status, lesson, later, csrf, clarifications = [], assessments = [] }) {
  const changed = lesson && lesson.change_id !== null;
  const unread = changed && !lesson.is_read;
  return layout('Сегодня', html`
    <main id="content" class="page today">
      <header class="today-head">
        <p>Учебный день · <time datetime="${date}">${formatDay(date)}</time> · МСК</p>
        <h1>Сегодня</h1>
      </header>
      <div class="today-main">
        ${lesson
          ? html`<article class="next-lesson">
              <div class="lesson-heading">
                <p>${status === 'current' ? 'Пара идёт' : 'Ближайшая пара'}</p>
                ${unread ? html`<span class="status-pill is-warning">Аудитория изменилась</span>` : ''}
              </div>
              <p class="lesson-time"><time datetime="${lesson.starts_at}">${lesson.starts_at}</time><span> · до
                <time datetime="${lesson.ends_at}">${lesson.ends_at}</time></span></p>
              <h2 class="lesson-subject">${lesson.subject}</h2>
              <p class="lesson-teacher">${lesson.teacher}</p>
              <div class="lesson-location">
                <p class="room">Аудитория ${lesson.current_room}</p>
                ${unread ? html`<p class="room-old">Было ${lesson.scheduled_room}</p>` : ''}
              </div>
              <div class="read-form">
                <a class="button-link primary" href="/schedule?date=${lesson.lesson_date}#lesson-${lesson.lesson_id}">Открыть занятие</a>
                ${unread
                  ? html`<form method="post" action="/read/${lesson.change_id}">
                      <input type="hidden" name="_csrf" value="${csrf}">
                      <button class="secondary">Отметить прочитанным</button>
                    </form>`
                  : changed ? html`<p class="state">Перенос отмечен прочитанным</p>` : ''}
              </div>
            </article>`
          : html`<div class="day-empty">
              <p>${status === 'finished' ? 'На сегодня пары закончились.' : 'Сегодня пар нет.'}</p>
              <a href="/schedule?date=${date}">Открыть расписание</a>
            </div>`}
        ${clarifications.length || assessments.length ? html`
          <div class="today-side">
            ${clarifications.length ? html`
              <section class="today-panel request-attention" aria-labelledby="actions-title">
                <h2 id="actions-title">От вас требуется</h2>
                <ul class="office-records" role="list">
                  ${clarifications.map(request => html`
                    <li><div>
                      <p>${request.subject ?? request.kind} · заявка № ${request.id}</p>
                      <a href="/requests/${request.id}#clarification">Ответить на вопрос учебного офиса</a>
                    </div></li>`)}
                </ul>
              </section>` : ''}
            ${assessments.length ? html`
              <section class="today-panel" aria-labelledby="upcoming-assessments">
                <h2 id="upcoming-assessments">Ближайшие экзамены и зачёты</h2>
                <dl>${assessments.map(assessment => html`<div>
                  <dt><a href="${pendingAssessmentHref(assessment.id)}">${assessment.subject}</a></dt>
                  <dd>${assessment.assessment} · <time datetime="${assessment.exam_date}">${formatDate(assessment.exam_date)}</time></dd>
                </div>`)}</dl>
              </section>` : ''}
          </div>` : ''}
      </div>
      ${later.length
        ? html`<section class="lesson-list">
            <h2>Ещё сегодня</h2>
            <dl>${later.map(otherLesson)}</dl>
          </section>`
        : ''}
    </main>`, { student, csrf, active: 'today' });
}
