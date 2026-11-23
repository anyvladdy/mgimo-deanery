import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

const months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// SQLite хранит created_at как «ГГГГ-ММ-ДД ЧЧ:ММ:СС» в UTC.
function formatDate(value) {
  const [date] = String(value).split(/[ T]/);
  const [year, month, day] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger) || month < 1 || month > 12) return value;
  return `${day} ${months[month - 1]} ${year}`;
}

function statusNote(status) {
  if (status === 'Готова') return 'Справка готова. Её можно получить в деканате.';
  if (status === 'Принята') return 'Заявка принята. Деканат подготовит справку и изменит статус на «Готова».';
  return 'Статус заявки обновит деканат.';
}

export function requestsPage(requests, csrf, student) {
  return layout('Мои справки', html`
    <main id="content" class="page requests">
      <header class="identity">
        <p class="eyebrow">Справки</p>
        <h1>Мои заявки</h1>
      </header>
      <p>Деканат выдаёт справку об обучении. Заявка сохраняется в кабинете, её статус обновит деканат.</p>
      <form method="post" action="/requests">
        <input type="hidden" name="_csrf" value="${csrf}">
        <button class="primary">Запросить справку</button>
      </form>
      <h2>Поданные заявки</h2>
      ${requests.length
        ? html`<dl>${requests.map(request => html`
            <div>
              <dt><a href="/requests/${request.id}">${request.kind}</a></dt>
              <dd>${request.status} · ${formatDate(request.created_at)}</dd>
            </div>`)}
          </dl>`
        : html`<p>Заявок пока нет. Первая заявка появится здесь после подачи.</p>`}
    </main>`, { student, csrf, active: 'requests' });
}

export function requestPage(request, csrf, student) {
  return layout(request.kind, html`
    <main id="content" class="page request">
      <header class="identity">
        <p class="eyebrow">Справка</p>
        <h1>${request.kind}</h1>
      </header>
      <p class="status">Статус: <strong>${request.status}</strong></p>
      <p>${statusNote(request.status)}</p>
      <dl>
        <div><dt>Номер заявки</dt><dd>${request.id}</dd></div>
        <div><dt>Дата подачи</dt><dd>${formatDate(request.created_at)}</dd></div>
      </dl>
      <p><a href="/requests">К моим заявкам</a></p>
    </main>`, { student, csrf, active: 'requests' });
}
