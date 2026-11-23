import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { pluralRu } from '../ui/plural.js';

export function searchPage({ query, error, result, actions, student, csrf }) {
  return layout('Поиск', html`
    <main id="content" class="page narrow">
      <header class="identity"><h1>Поиск</h1></header>
      <form class="directory-filter" role="search" method="get" action="/search" autocomplete="off">
        <div>
          <label for="global-search">Что найти</label>
          <input id="global-search" type="search" name="q" maxlength="100" value="${query}"
            aria-describedby="global-search-hint${error ? ' global-search-error' : ''}"
            ${error ? html`aria-invalid="true" autofocus` : ''}>
          <p id="global-search-hint" class="hint">От двух символов. Например, название дисциплины или номер аудитории.</p>
          ${error ? html`<p class="error" id="global-search-error" role="alert">${error}</p>` : ''}
        </div>
        <button class="primary">Найти</button>
      </form>
      ${result ? html`<p aria-live="polite">${result.total
        ? `Найдено ${result.total} ${pluralRu(result.total, 'результат', 'результата', 'результатов')}`
        : 'Ничего не найдено.'}</p>` : ''}
      ${result?.groups.map(([label, items], index) => html`
        <section aria-labelledby="search-section-${index}">
          <h2 id="search-section-${index}">${label}</h2>
          <ul class="office-records search-results" role="list">${items.map(item => html`
            <li><div><a class="back-link" href="${item.href}">${item.title}</a><p class="hint">${item.description}</p></div></li>`)}</ul>
        </section>`)}
      ${!result?.total && actions.length ? html`<section aria-labelledby="search-actions">
        <h2 id="search-actions">Частые действия</h2>
        <div class="office-buttons">${actions.map(action => html`<a class="button-link secondary" href="${action.href}">${action.title}</a>`)}</div>
      </section>` : ''}
    </main>`, { student, csrf, active: 'search' });
}
