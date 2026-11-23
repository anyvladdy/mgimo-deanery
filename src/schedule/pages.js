import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { weekNavigation } from '../ui/presentation.js';
import { isDate, shiftDate } from './schedule.js';

const months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const weekdays = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const shortWeekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

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

function formatWeek(dates) {
  const start = dates[0];
  const end = dates.at(-1);
  if (start === end) return formatDate(start);
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${parts(start).getUTCDate()}–${formatDate(end)}`
    : `${formatDate(start)} — ${formatDate(end)}`;
}

function lessonRow(lesson, teacherSubjects) {
  return html`
    <div id="lesson-${lesson.lesson_id}" tabindex="-1">
      <dt><span class="schedule-target-date"><time datetime="${lesson.lesson_date}">${formatDay(lesson.lesson_date)}</time></span>
        <span class="schedule-time"><time datetime="${lesson.starts_at}">${lesson.starts_at}</time>
        <span>до <time datetime="${lesson.ends_at}">${lesson.ends_at}</time></span></span>
        <span class="schedule-subject">${lesson.subject}</span></dt>
      <dd>${lesson.change_id !== null
        ? html`<span class="schedule-rooms">
            <strong>Сейчас в ауд. ${lesson.current_room}${lesson.buildingName ? ` · ${lesson.buildingName}` : ''}</strong>
            <span class="room-old">Было ${lesson.scheduled_room}</span>
          </span><span class="schedule-teacher">${lesson.teacher}</span>`
        : html`<span class="schedule-teacher">${lesson.teacher}</span><span class="schedule-inline-separator"> · </span><span class="schedule-current-room">ауд. ${lesson.current_room}${lesson.buildingName ? ` · ${lesson.buildingName}` : ''}</span>`}
        ${teacherSubjects?.has(lesson.subject) ? html`<span class="lesson-contact">
          <a class="back-link" href="/messages/new?lesson=${lesson.lesson_id}">Написать преподавателю</a>
        </span>` : ''}</dd>
    </div>`;
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

function scheduleQuery(date, building, view) {
  const params = new URLSearchParams({ date });
  if (building) params.set('building', building);
  if (view) params.set('view', view);
  return `?${params}`;
}

function dateLink(date, anchor, label, building, accessibleLabel) {
  return isDate(date) ? html`<a href="${scheduleQuery(date, building)}#${anchor}"
    ${accessibleLabel ? html`aria-label="${accessibleLabel}"` : ''}>${label}</a>` : '';
}

function weekPicker(date, dates, days, building) {
  return html`<ul class="week-picker" role="list">
    ${dates.map(day => {
      const value = parts(day);
      const count = days.find(entry => entry.date === day)?.lessons.length ?? 0;
      const label = `${formatDay(day)}${count ? `. Число занятий — ${count}` : '. Пар нет'}`;
      return html`<li>
        <a href="${scheduleQuery(day, building)}#day" aria-label="${label}" aria-current="${day === date ? 'date' : 'false'}">
          <span>${shortWeekdays[value.getUTCDay()]}</span>
          <strong>${value.getUTCDate()}</strong>
          <span class="week-count">${count || '—'}</span>
        </a>
      </li>`;
    })}
  </ul>`;
}

function weekContent(days, printable = false, teacherSubjects, building) {
  return days.length
    ? days.map(day => html`
      <section class="schedule-week-day" aria-labelledby="weekday-${day.date}">
        <h3 id="weekday-${day.date}">${printable ? formatDay(day.date) : dateLink(day.date, 'day', formatDay(day.date), building)}</h3>
        <dl>${day.lessons.map(lesson => lessonRow(lesson, teacherSubjects))}</dl>
      </section>`)
    : html`<p class="section-empty">На этой неделе пар нет.</p>`;
}

export function schedulePage({
  date, today, weekStart, lessons, week, student, csrf, print = false, canPrint = false,
  hasCalendar = false, teacherSubjects, buildings = [], selected,
}) {
  const building = selected?.id;
  const days = weekDays(week);
  const dates = Array.from({ length: 7 }, (_, offset) => shiftDate(weekStart, offset)).filter(isDate);
  const range = formatWeek(dates);
  if (print) {
    return layout('Расписание на неделю', html`
      <main id="content" class="page schedule schedule-print">
        <header class="identity">
          <h1>Расписание на неделю</h1>
          <p>Группа ${student.group_code} · ${range}${selected ? ` · ${selected.name}` : ''}</p>
        </header>
        <p class="print-help">Чтобы распечатать расписание или сохранить PDF, выберите «Печать» в меню браузера.</p>
        ${weekContent(days, true)}
        <p class="print-help"><a href="${scheduleQuery(date, building)}#week">К расписанию</a></p>
      </main>`, { student, csrf, active: 'schedule' });
  }
  const otherDays = days.filter(day => day.date !== date);
  const previousWeek = shiftDate(weekStart, -7);
  const previousWeekDate = isDate(previousWeek) ? previousWeek : shiftDate(weekStart, -1);
  return layout('Расписание занятий', html`
    <main id="content" class="page schedule">
      <header class="identity directory-title">
        <div><p class="eyebrow">Группа ${student.group_code}</p><h1>Расписание занятий</h1>
          <p class="hint">Пары вашей группы, преподаватели, аудитории и переносы.</p>
        </div>
        ${hasCalendar ? html`<a class="button-link secondary design-week-link" href="/calendar?date=${date}">Все события недели</a>` : ''}
      </header>
      ${hasCalendar ? weekNavigation('schedule', scheduleQuery(date, building), `/calendar?date=${date}`) : ''}
      ${buildings.length ? html`<nav class="section-links" aria-label="Корпуса">
        <a href="${scheduleQuery(date)}" ${!selected ? html`aria-current="page"` : ''}>Все корпуса</a>
        ${buildings.map(item => html`<a href="${scheduleQuery(date, item.id)}"
          ${item.id === building ? html`aria-current="page"` : ''}>${item.name}</a>`)}
      </nav>` : ''}
      <nav aria-label="Переходы по датам">
        <h2 id="calendar" tabindex="-1">${range}</h2>
        <div class="schedule-actions schedule-week-controls">
          ${dateLink(previousWeekDate, 'calendar', 'Предыдущая', building, 'Предыдущая неделя')}
          ${dateLink(shiftDate(weekStart, 7), 'calendar', 'Следующая', building, 'Следующая неделя')}
          ${date !== today ? dateLink(today, 'calendar', 'К сегодняшнему дню', building) : ''}
        </div>
        ${weekPicker(date, dates, days, building)}
      </nav>

      <section id="day" tabindex="-1" aria-labelledby="day-title">
        <h2 id="day-title">${formatDay(date)}</h2>
        ${lessons.length
          ? html`<dl>${lessons.map(lesson => lessonRow(lesson, teacherSubjects))}</dl>`
          : html`<p class="section-empty">В этот день пар нет.</p>`}
        <div class="schedule-actions">
          ${dateLink(shiftDate(date, -1), 'day', 'Предыдущий день', building)}
          ${dateLink(shiftDate(date, 1), 'day', 'Следующий день', building)}
          <a href="${scheduleQuery(date, building)}#week">Другие дни недели</a>
        </div>
      </section>
      ${canPrint ? html`<a class="back-link" href="${scheduleQuery(date, building, 'print')}">Версия для печати</a>` : ''}

      <section id="week" tabindex="-1" aria-labelledby="week-title">
        <h2 id="week-title">Другие дни недели</h2>
        ${otherDays.length ? weekContent(otherDays, false, teacherSubjects, building) : html`<p class="section-empty">${days.length ? 'Других занятий на этой неделе нет.' : 'На этой неделе пар нет.'}</p>`}
      </section>
    </main>`, { student, csrf, active: 'schedule' });
}
