import { html } from 'hono/html';
import { homeTitle, layout } from '../ui/layout.js';

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

function dashboardShortcuts(shortcuts) {
  return html`<section class="today-panel today-shortcuts" aria-labelledby="today-shortcuts">
    <h2 id="today-shortcuts">Доступные разделы</h2>
    <p>Расписание сейчас недоступно.</p>
    <nav aria-labelledby="today-shortcuts">
      ${shortcuts.map(([href, label]) => html`<a class="button-link secondary" href="${href}">${label}</a>`)}
      <a class="button-link secondary" href="/profile">Профиль</a>
    </nav>
  </section>`;
}

function agendaLesson(lesson, { phase, csrf }) {
  const changed = lesson.change_id !== null;
  const unread = changed && !lesson.is_read;
  return html`<li class="design-agenda-lesson" data-phase="${phase}">
    <p class="design-agenda-time"><time datetime="${lesson.starts_at}">${lesson.starts_at}</time>
      <span>до <time datetime="${lesson.ends_at}">${lesson.ends_at}</time></span></p>
    <div class="design-agenda-info">
      <a class="design-agenda-subject" href="/schedule?date=${lesson.lesson_date}#lesson-${lesson.lesson_id}">${lesson.subject}</a>
      <p class="hint">${lesson.teacher}</p>
      <p><strong>Аудитория ${lesson.current_room}</strong>
        ${unread ? html`<span class="room-old">Было ${lesson.scheduled_room}</span>` : ''}</p>
      ${unread ? html`<form method="post" action="/read/${lesson.change_id}">
        <input type="hidden" name="_csrf" value="${csrf}"><button class="secondary">Отметить перенос прочитанным</button>
      </form>` : changed ? html`<p class="hint">Перенос отмечен прочитанным</p>` : ''}
    </div>
    ${phase || unread ? html`<div class="design-agenda-status">
      ${phase ? html`<span class="status-pill${phase === 'current' ? ' is-ready' : ''}">${{
        complete: 'Прошла', current: 'Идёт сейчас', next: 'Следующая', upcoming: 'Предстоит',
      }[phase]}</span>` : ''}
      ${unread ? html`<span class="status-pill is-warning">Аудитория изменилась</span>` : ''}
    </div>` : ''}
  </li>`;
}

const dayLabel = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', timeZone: 'UTC' });

function fullAgenda(days, { lesson: nextLesson, status, time, csrf }) {
  return html`<section class="design-agenda" aria-labelledby="today-agenda-title" hidden>
    <header class="directory-title">
      <h2 id="today-agenda-title">Пары группы</h2>
      <a class="button-link secondary" href="/schedule?date=${days[0].date}">Расписание на неделю</a>
    </header>
    ${days.map((day, index) => html`<section class="design-agenda-day" aria-labelledby="agenda-${day.date}">
      <h3 id="agenda-${day.date}">${day.label} <time datetime="${day.date}">${dayLabel.format(new Date(`${day.date}T00:00:00Z`))}</time></h3>
      ${day.lessons.length ? html`<ul role="list">${day.lessons.map(lesson => {
        const phase = index ? '' : lesson.ends_at <= time ? 'complete'
          : lesson.starts_at <= time ? 'current'
            : lesson.lesson_id === nextLesson?.lesson_id && status === 'upcoming' ? 'next' : 'upcoming';
        return agendaLesson(lesson, { phase, csrf });
      })}</ul>` : html`<p class="hint">Пар нет.</p>`}
    </section>`)}
  </section>`;
}

export function homePage({
  student, date, status, lesson, later, agenda, time, csrf, clarifications = [], assessments = [], replies = [], contributions = [], shortcuts = [],
}) {
  const changed = lesson && lesson.change_id !== null;
  const unread = changed && !lesson.is_read;
  return layout(homeTitle, html`
    <main id="content" class="page today">
      <header class="today-head">
        <p><time datetime="${date}">${formatDay(date)}</time>&nbsp;·&nbsp;МСК</p>
        <h1>${homeTitle}</h1>
      </header>
      <div class="today-main">
        ${agenda ? fullAgenda(agenda, { lesson, status, time, csrf }) : ''}
        ${status === 'unavailable' ? dashboardShortcuts(shortcuts) : lesson
          ? html`<article class="next-lesson${agenda ? ' design-agenda-fallback' : ''}">
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
          : html`<div class="day-empty${agenda ? ' design-agenda-fallback' : ''}">
              <p>${status === 'finished' ? 'На сегодня пары закончились.' : 'Сегодня пар нет.'}</p>
              <a href="/schedule?date=${date}">Открыть расписание</a>
            </div>`}
        ${clarifications.length || assessments.length || replies.length || contributions.length ? html`
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
            ${replies.length ? html`
              <section class="today-panel" aria-labelledby="new-replies">
                <h2 id="new-replies">Новые ответы</h2>
                <dl>${replies.map(reply => html`<div>
                  <dt><a href="${reply.href}">${reply.title}</a></dt>
                  <dd>${reply.category} · ${reply.message}</dd>
                </div>`)}</dl>
              </section>` : ''}
            ${assessments.length ? html`
              <section class="today-panel" aria-labelledby="upcoming-assessments">
                <h2 id="upcoming-assessments">Ближайшие экзамены и зачёты</h2>
                <dl>${assessments.map(assessment => html`<div>
                  <dt><a href="${assessment.href}">${assessment.subject}</a></dt>
                  <dd>${assessment.assessment} · <time datetime="${assessment.exam_date}${assessment.exam_time ? `T${assessment.exam_time}:00+03:00` : ''}">${assessment.details}</time></dd>
                </div>`)}</dl>
                <a href="/grades/session">Открыть сессию</a>
              </section>` : ''}
            ${contributions}
          </div>` : ''}
      </div>
      ${later.length
        ? html`<section class="lesson-list${agenda ? ' design-agenda-fallback' : ''}">
            <h2>Ещё сегодня</h2>
            <dl>${later.map(otherLesson)}</dl>
          </section>`
        : ''}
    </main>`, { student, csrf, active: 'today' });
}
