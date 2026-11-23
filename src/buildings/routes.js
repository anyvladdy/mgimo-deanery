import { Hono } from 'hono';
import { html } from 'hono/html';
import { dateFilter, officeDateInput } from '../ui/date-input.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';

function buildingPage({ date, dateInput, dateError, now, buildings, student, csrf }) {
  const viewingToday = date === now.date;
  return layout('Часы работы корпусов', html`
    <main class="page" id="content">
      <header class="identity"><h1>Часы работы корпусов</h1></header>
      <form class="directory-filter" method="get" action="/buildings">
        <div class="office-date-filter-field">${officeDateInput('buildings-date', 'Дата посещения', dateInput, dateError)}</div>
        <button class="secondary">Показать</button>
        ${date !== now.date ? html`<a class="button-link secondary" href="/buildings">Сегодня</a>` : ''}
      </form>
      ${buildings.length ? html`
        <header class="identity">
          <h2><time datetime="${date}">${formatDate(date)}</time></h2>
          ${viewingToday ? html`<p class="hint">Сейчас · <time datetime="${now.date}T${now.time}+03:00">${now.time.slice(0, 5)}&nbsp;МСК</time></p>` : ''}
        </header>
        <div class="request-actions">
          ${buildings.map(building => html`<section aria-labelledby="building-${building.id}">
            <h3 id="building-${building.id}">${building.name}</h3>
            <p>${building.address}</p>
            <dl>
              <div>
                <dt>Часы работы</dt>
                <dd>${building.opens_at ? html`<time datetime="${building.opens_at}">${building.opens_at}</time>–<time datetime="${building.closes_at}">${building.closes_at}</time> МСК` : 'Выходной'}</dd>
              </div>
              ${viewingToday ? html`<div>
                <dt>Сейчас</dt>
                <dd><span class="status-pill${building.is_open ? ' is-ready' : ''}">${building.is_open ? 'Открыт' : 'Закрыт'}</span></dd>
              </div>` : ''}
            </dl>
          </section>`)}
        </div>
      ` : html`<p class="section-empty">Данные о корпусах пока недоступны.</p>`}
    </main>`, { student, csrf, active: 'buildings' });
}

export function buildingRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  routes.get('/', c => {
    const now = currentSchoolDay();
    const selection = dateFilter(c.req.query('date'), now.date);
    const { date } = selection;
    const time = now.time.slice(0, 5);
    const buildings = db.prepare(`
      SELECT b.id, b.name, b.address, chosen.opens_at, chosen.closes_at,
             chosen.opens_at <= ? AND chosen.closes_at > ? AS is_open
      FROM campus_buildings b
      LEFT JOIN campus_building_hours chosen ON chosen.building_id = b.id AND chosen.weekday = STRFTIME('%w', ?)
      ORDER BY b.id
    `).all(time, time, date);
    return c.html(buildingPage({ ...selection, now, buildings, student: c.get('student'), csrf: c.get('csrfToken') }));
  });
  return routes;
}
