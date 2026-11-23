import { Hono } from 'hono';
import { html } from 'hono/html';
import { presentationVariant } from './presentation.js';
import { layout } from './layout.js';

export function studentServiceRoutes(items) {
  const routes = new Hono();
  routes.get('/', c => c.html(layout('Сервисы', html`
    <main class="page" id="content">
      <header class="identity"><h1>Сервисы</h1></header>
      <ul class="service-catalog" role="list">
        ${items.map(([href, label, , fullHref]) => {
          const alternate = fullHref && presentationVariant() !== 'lite';
          return html`<li>
            <a class="directory-card${alternate ? ' design-service-fallback' : ''}" href="${href}">${label}</a>
            ${alternate ? html`<a class="directory-card design-service-full" href="${fullHref}" hidden>${label}</a>` : ''}
          </li>`;
        })}
      </ul>
    </main>`, { student: c.get('student'), csrf: c.get('csrfToken'), active: 'services' })));
  return routes;
}
