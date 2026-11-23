import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { formatDate, timestamp } from '../ui/format.js';
import { digestHref } from './digest.js';

function noticeDate(event) {
  if (event.deliveredAt) return html` · ${timestamp(event.deliveredAt)}`;
  return event.kind === 'group' ? html` · <time datetime="${event.date}">${formatDate(event.date)}</time>` : '';
}

function noticeCard(event, filters, csrf) {
  return html`<li id="notice-${event.kind}-${event.id}" tabindex="-1"${event.kind === 'message' && !event.read ? html` class="notice-reply"` : ''}>
    <div>
      <div class="notice-meta">
        <p>${event.category}${noticeDate(event)}</p>
        ${event.critical ? html`<span class="status-pill is-warning">Срочно</span>` : ''}
        ${event.read || event.actionOnly ? '' : html`<span class="status-pill is-new">Новое</span>`}
      </div>
      <h3>${event.href ? html`<a class="back-link" href="${event.href}">${event.title}</a>` : event.title}</h3>
      ${event.message ? html`<p>${event.message}</p>` : ''}
    </div>
    ${event.actionOnly ? '' : event.read ? html`<span class="status-pill">Прочитано</span>` : html`
      <form method="post" action="/notices/read">
        <input type="hidden" name="_csrf" value="${csrf}">
        <input type="hidden" name="kind" value="${event.kind}">
        <input type="hidden" name="event" value="${event.id}">
        ${event.kind === 'exam' ? html`<input type="hidden" name="date" value="${event.date}">` : ''}
        <input type="hidden" name="view" value="${filters.unread ? 'unread' : 'all'}">
        <input type="hidden" name="period" value="${filters.period}">
        <button class="secondary" aria-label="Отметить прочитанным · ${event.title}">Отметить прочитанным</button>
      </form>`}
  </li>`;
}

export function noticesPage(groups, filters, student, csrf) {
  const { unread, period } = filters;
  return layout('Уведомления', html`
    <main id="content" class="page notices">
      <header class="identity"><h1>Уведомления</h1></header>
      <nav class="section-links" aria-label="Статус уведомлений">
        <a href="${digestHref({ unread: false, period })}" aria-current="${unread ? 'false' : 'page'}">Все</a>
        <a href="${digestHref({ unread: true, period })}" aria-current="${unread ? 'page' : 'false'}">Непрочитанные</a>
      </nav>
      <nav class="section-links" aria-label="Период уведомлений">
        ${[['all', 'За всё время'], ['today', 'Сегодня'], ['week', 'Ближайшие 7 дней']].map(([value, label]) => html`
          <a href="${digestHref({ unread, period: value })}" ${period === value ? html`aria-current="page"` : ''}>${label}</a>`)}
      </nav>
      ${groups.length ? groups.map(([label, events], index) => html`
        <section aria-labelledby="notice-section-${index}">
          <h2 id="notice-section-${index}">${label}</h2>
          <ul class="office-records notice-list" role="list">${events.map(event => noticeCard(event, filters, csrf))}</ul>
        </section>`)
        : html`<p class="section-empty">${period !== 'all' ? 'За выбранный период уведомлений нет.'
          : unread ? 'Непрочитанных уведомлений нет.' : 'Уведомлений пока нет.'}</p>`}
    </main>`, { student, csrf, active: 'notices' });
}
