import { Hono } from 'hono';
import { html } from 'hono/html';
import { dateFilter, officeDateInput } from '../ui/date-input.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';

const formatPrice = new Intl.NumberFormat('ru-RU');

function diningPage({ date, dateInput, dateError, menu, dishes, nearest, student, csrf }) {
  return layout('Меню столовой', html`
    <main class="page narrow" id="content">
      <header class="identity"><h1>Меню столовой</h1></header>
      <form class="directory-filter" method="get" action="/dining">
        <div class="office-date-filter-field">${officeDateInput('dining-date', 'Дата меню', dateInput, dateError)}</div>
        <button class="secondary">Показать</button>
      </form>
      ${menu && dishes.length ? html`
        <header class="identity">
          <h2>${menu.point}</h2>
          <p class="hint"><time datetime="${date}">${formatDate(date)}</time>
            · <time datetime="${menu.opens_at}">${menu.opens_at}</time>–<time datetime="${menu.closes_at}">${menu.closes_at}</time> МСК</p>
        </header>
        ${Object.entries(Object.groupBy(dishes, dish => dish.category)).map(([category, items]) => html`
          <section aria-label="${category}">
            <h3>${category}</h3>
            <ul class="office-records" role="list">
              ${items.map(item => html`<li><div>${item.name}</div><strong>${formatPrice.format(item.price)} ₽</strong></li>`)}
            </ul>
          </section>`)}
      ` : html`
        <p class="section-empty">На ${formatDate(date)} меню не опубликовано.</p>
        ${nearest ? html`<a class="button-link secondary" href="/dining?date=${nearest.menu_date}">
          Меню на ${formatDate(nearest.menu_date)}
        </a>` : ''}`}
    </main>`, { student, csrf, active: 'dining' });
}

export function diningRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  routes.get('/', c => {
    const selection = dateFilter(c.req.query('date'), currentSchoolDay().date);
    const { date } = selection;
    const menu = db.prepare('SELECT * FROM dining_menus WHERE menu_date = ?').get(date);
    const dishes = db.prepare('SELECT * FROM dining_dishes WHERE menu_date = ? ORDER BY position').all(date);
    const nearest = dishes.length ? null : db.prepare(`
      SELECT menu_date FROM dining_dishes GROUP BY menu_date
      ORDER BY ABS(JULIANDAY(menu_date) - JULIANDAY(?)), menu_date DESC LIMIT 1
    `).get(date);
    return c.html(diningPage({ ...selection, menu, dishes, nearest, student: c.get('student'), csrf: c.get('csrfToken') }));
  });
  return routes;
}
