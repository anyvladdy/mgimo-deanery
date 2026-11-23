import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate } from '../ui/format.js';

export function noticesPage(events, unread, student, csrf) {
  const visible = unread ? events.filter(event => !event.read) : events;
  return layout('Уведомления', html`
    <main id="content" class="page notices">
      <header class="identity"><h1>Уведомления</h1></header>
      <nav class="section-links" aria-label="Фильтр уведомлений">
        <a href="/notices" aria-current="${unread ? 'false' : 'page'}">Все</a>
        <a href="/notices?view=unread" aria-current="${unread ? 'page' : 'false'}">Непрочитанные</a>
      </nav>
      ${visible.length ? html`<ul class="office-records notice-list" role="list">${visible.map(event => html`
        <li>
          <div>
            <div class="notice-meta">
              <p>${event.category} · <time datetime="${event.date.slice(0, 10)}">${formatDate(event.date)}</time></p>
              ${event.read ? '' : html`<span class="status-pill is-new">Новое</span>`}
            </div>
            <h2>${event.href ? html`<a href="${event.href}">${event.title}</a>` : event.title}</h2>
            ${event.message ? html`<p>${event.message}</p>` : ''}
          </div>
          ${event.read ? html`<span class="status-pill">Прочитано</span>` : html`
            <form method="post" action="/notices/read">
              <input type="hidden" name="_csrf" value="${csrf}">
              <input type="hidden" name="kind" value="${event.kind}">
              <input type="hidden" name="event" value="${event.id}">
              ${event.kind === 'exam' ? html`<input type="hidden" name="date" value="${event.date}">` : ''}
              <input type="hidden" name="view" value="${unread ? 'unread' : 'all'}">
              <button class="secondary" aria-label="Отметить прочитанным · ${event.title}">Отметить прочитанным</button>
            </form>`}
        </li>`)}</ul>` : html`<p class="section-empty">${unread ? 'Непрочитанных уведомлений нет.' : 'Уведомлений пока нет.'}</p>`}
    </main>`, { student, csrf, active: 'notices' });
}
