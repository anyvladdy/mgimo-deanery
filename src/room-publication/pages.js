import { html } from 'hono/html';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { maxRoomLength } from './publication.js';

export function roomSchedulePage(date, lessons, context) {
  return layout('Аудитории по расписанию', html`
    <main class="page office-page" id="content">
      <a class="back-link" href="/office">К рабочему столу</a>
      <header class="identity"><h1>Аудитории по расписанию</h1></header>
      <form class="directory-filter" method="get" action="/office/schedule">
        <label>Дата занятия <input type="date" name="date" value="${date}" required></label>
        <button class="secondary">Показать занятия</button>
      </form>
      ${lessons.length ? html`
        <ul class="office-records" role="list">${lessons.map(lesson => html`
          <li>
            <div>
              <a href="/office/schedule/${lesson.id}">${lesson.subject}</a>
              <p>${lesson.starts_at}–${lesson.ends_at} · ${lesson.group_code} · ауд. ${lesson.new_room ?? lesson.scheduled_room}</p>
            </div>
            ${lesson.new_room !== null ? html`<span class="status-pill is-ready">Перенос опубликован</span>` : ''}
          </li>`)}</ul>
      ` : html`<p class="section-empty">На эту дату занятий нет.</p>`}
    </main>`, context);
}

export function roomPublicationPage(lesson, context, { error = '', room = '' } = {}) {
  const published = lesson.new_room !== null;
  return layout('Перенос аудитории', html`
    <main class="page narrow office-page" id="content">
      <a class="back-link" href="/office/schedule?date=${lesson.lesson_date}">К занятиям на эту дату</a>
      <header class="identity"><h1>Перенос аудитории</h1></header>
      <dl class="office-detail">
        <div><dt>Занятие</dt><dd>${lesson.subject}</dd></div>
        <div><dt>Преподаватель</dt><dd>${lesson.teacher}</dd></div>
        <div><dt>Группа</dt><dd>${lesson.group_code}</dd></div>
        <div><dt>Дата и время</dt>
          <dd><time datetime="${lesson.lesson_date}">${formatDate(lesson.lesson_date)}</time> · ${lesson.starts_at}–${lesson.ends_at}</dd></div>
        <div><dt>Исходная аудитория</dt><dd>${lesson.scheduled_room}</dd></div>
        ${published ? html`<div><dt>Новая аудитория</dt><dd>${lesson.new_room}</dd></div>` : ''}
      </dl>
      ${error ? html`<p class="error" id="room-error" role="alert">${error}</p>` : ''}
      ${published ? html`<p class="status-pill is-ready">Перенос опубликован</p>` : html`
        <form class="form-panel" method="post" action="/office/schedule/${lesson.id}">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          <label for="new-room">Новая аудитория</label>
          <input id="new-room" name="room" value="${room}" maxlength="${maxRoomLength}" required
            ${error ? html`aria-invalid="true" aria-describedby="room-error" autofocus` : ''}>
          <p>После публикации группа увидит новую аудиторию в расписании и уведомлениях.</p>
          <button class="primary">Опубликовать перенос</button>
        </form>`}
    </main>`, context);
}
