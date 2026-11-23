import { Hono } from 'hono';
import { html } from 'hono/html';
import { modulesFor } from '../modules/config.js';
import { presentationVariant } from '../ui/presentation.js';
import { formatDate } from '../ui/format.js';
import { layout, messagePage } from '../ui/layout.js';

const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const published = 'SELECT * FROM university_news WHERE published_at <= deanery_timestamp()';

function feed(db) {
  return db.prepare(`${published} ORDER BY published_at DESC, id DESC LIMIT 50`).all();
}

function newsList(items, prefix) {
  return items.length ? html`<ul class="office-records" role="list">${items.map(item => html`
    <li><div>
      <p class="hint">${formatDate(item.published_at)}</p>
      <h2><a class="back-link" href="${prefix}/${item.id}">${item.title}</a></h2>
      <p>${item.body.length > 180 ? `${item.body.slice(0, 180).trimEnd()}…` : item.body}</p>
    </div></li>`)}</ul>` : html`<p class="section-empty">Новостей пока нет.</p>`;
}

function staffPage(c, items, fields = {}, error = '') {
  const csrf = c.get('csrfToken');
  return c.html(layout('Новости университета', html`
    <main class="page narrow academic-content" id="content">
      <header class="identity"><h1>Новости университета</h1></header>
      ${c.req.query('published') === '1' ? html`<p class="status-pill is-ready" role="status">Новость опубликована</p>` : ''}
      <section aria-labelledby="news-publish">
        <h2 id="news-publish">Новая публикация</h2>
        <form class="form-panel" method="post" action="/office/news">
          <input type="hidden" name="_csrf" value="${csrf}">
          ${error ? html`<p id="news-error" class="error" role="alert">${error}</p>` : ''}
          <label for="news-title">Заголовок</label>
          <input id="news-title" name="title" required maxlength="160" value="${fields.title ?? ''}"
            ${error ? html`aria-describedby="news-error" autofocus` : ''}>
          <label for="news-body">Текст</label>
          <textarea id="news-body" name="body" required maxlength="2000" rows="7">${fields.body ?? ''}</textarea>
          <button class="primary">Опубликовать</button>
        </form>
      </section>
      ${newsList(items, '/office/news')}
    </main>`, { staff: c.get('staff'), csrf, active: 'university-news' }), error ? 422 : 200);
}

function article(c, db, { staff = false } = {}) {
  const prefix = staff ? '/office/news' : '/news';
  const context = { staff: staff ? c.get('staff') : null, student: staff ? null : c.get('student'),
    active: 'university-news', csrf: c.get('csrfToken') };
  const item = db.prepare(`${published} AND id = ?`).get(idFrom(c.req.param('id')));
  if (!item) return c.html(messagePage('Новость не найдена', 'Откройте список публикаций.', prefix, 'К новостям', context), 404);
  const event = !staff && item.campus_event_id
    ? modulesFor(db).get('campus-events')?.eventForStudent(db, c.get('studentId'), item.campus_event_id) : null;
  return c.html(layout(item.title, html`
    <main class="page narrow academic-content" id="content">
      <a class="back-link" href="${prefix}">Новости университета</a>
      <article class="today-panel">
        <p class="hint">${formatDate(item.published_at)}</p>
        <h1>${item.title}</h1>
        <p class="academic-prose">${item.body}</p>
        ${event ? html`<a class="button-link secondary" href="/events/${event.id}">Открыть событие</a>` : ''}
      </article>
    </main>`, context));
}

export default {
  id: 'university-news',
  demoUpgrade: true,
  todayPanel({ db }) {
    if (presentationVariant() === 'lite') return '';
    const item = db.prepare(`${published} ORDER BY published_at DESC, id DESC LIMIT 1`).get();
    if (!item) return '';
    return html`<section class="today-panel design-home-news" aria-labelledby="today-news-title" hidden>
      <h2 id="today-news-title">Новости университета</h2>
      <p class="hint">${formatDate(item.published_at)}</p>
      <a href="/news/${item.id}">${item.title}</a>
      <a class="back-link" href="/news">Все новости</a>
    </section>`;
  },
  studentMount({ db }) {
    const routes = new Hono();
    routes.get('/', c => c.html(layout('Новости университета', html`
      <main class="page narrow academic-content" id="content">
        <header class="identity"><h1>Новости университета</h1></header>
        ${newsList(feed(db), '/news')}
      </main>`, { student: c.get('student'), csrf: c.get('csrfToken'), active: 'university-news' })));
    routes.get('/:id', c => article(c, db));
    return ['/news', routes];
  },
  staffMount({ db }) {
    const routes = new Hono();
    routes.get('/', c => staffPage(c, feed(db)));
    routes.get('/:id', c => article(c, db, { staff: true }));
    routes.post('/', c => {
      const form = c.get('form');
      const title = typeof form.title === 'string' ? form.title.trim() : '';
      const body = typeof form.body === 'string' ? form.body.trim() : '';
      if (!title || title.length > 160 || /[\u0000-\u001f\u007f]/u.test(title) || !body || body.length > 2000) {
        return staffPage(c, feed(db), { title: title.slice(0, 160), body: body.slice(0, 2000) },
          'Введите заголовок в одну строку и текст длиной до 2000 символов.');
      }
      db.prepare(`
        INSERT INTO university_news (title, body, published_at)
        SELECT ?, ?, deanery_timestamp() WHERE NOT EXISTS (SELECT 1 FROM university_news WHERE title = ? AND body = ?)
      `).run(title, body, title, body);
      return c.redirect('/office/news?published=1', 303);
    });
    return { path: '/news', routes, dashboard: { label: 'Новости университета', description: 'Публикации для студентов', order: 75 } };
  },
  navigation(group) {
    if (group === 'studentTools') return [[22, '/news', 'Новости университета', 'university-news', 'home']];
    if (group === 'officeMain') return [[75, '/office/news', 'Новости', 'university-news']];
    return [];
  },
};
