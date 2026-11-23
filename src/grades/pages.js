import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

const months = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function formatDate(value) {
  const [date] = String(value).split(/[ T]/);
  const [year, month, day] = date.split('-').map(Number);
  if (![year, month, day].every(Number.isInteger) || month < 1 || month > 12) return value;
  return `${day} ${months[month - 1]} ${year}`;
}

function result(grade) {
  if (grade.result) return html`<strong>${grade.result}</strong>`;
  return html`<span>Ещё не выставлен${grade.exam_date ? html` · ${formatDate(grade.exam_date)}` : ''}</span>`;
}

export function gradesPage(grades, student, csrf) {
  return layout('Ведомость', html`
    <main id="content" class="page grades">
      <header class="identity">
        <p class="eyebrow">Успеваемость</p>
        <h1>Ведомость</h1>
      </header>
      <p>Оценки и зачёты текущего семестра. Итог по предстоящему экзамену появится после выставления.</p>
      ${grades.length
        ? html`<dl>${grades.map(grade => html`
            <div>
              <dt>${grade.subject}</dt>
              <dd>${grade.assessment} · ${result(grade)}</dd>
            </div>`)}
          </dl>`
        : html`<p>Ведомость пока пуста.</p>`}
      <p><a href="/">Открыть «Сегодня»</a></p>
    </main>`, { student, csrf, active: 'grades' });
}
