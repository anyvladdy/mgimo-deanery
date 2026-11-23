import { Hono } from 'hono';
import { html } from 'hono/html';
import { modulesFor } from '../modules/config.js';
import { formatDate } from '../ui/format.js';
import { layout } from '../ui/layout.js';

function tuitionForStudent(db, studentId) {
  return db.prepare('SELECT funding, due_date FROM student_tuition WHERE student_id = ?').get(studentId);
}

export function calendarEvents(db, studentId, { from, to }) {
  const tuition = tuitionForStudent(db, studentId);
  if (tuition?.funding !== 'paid' || tuition.due_date < from || tuition.due_date > to) return [];
  return [{
    id: `tuition:${studentId}`,
    kind: 'tuition',
    title: 'Срок оплаты обучения',
    date: tuition.due_date,
    href: '/tuition',
  }];
}

function dueDate(date) {
  return html`<time datetime="${date}">${formatDate(date)}</time>`;
}

function tuitionPage(tuition, { student, csrf, canContact, date }) {
  const paid = tuition?.funding === 'paid';
  return layout('Оплата обучения', html`
    <main id="content" class="page narrow">
      <header class="identity"><h1>Оплата обучения</h1></header>
      ${tuition ? html`
        <section class="today-panel" aria-labelledby="tuition-funding">
          <h2 id="tuition-funding">${paid ? 'Платное обучение' : 'Бюджетное обучение'}</h2>
          ${paid ? html`
            <dl><div>
              <dt>${tuition.due_date < date ? 'Срок оплаты прошёл' : 'Срок оплаты'}</dt>
              <dd>${dueDate(tuition.due_date)}</dd>
            </div></dl>
            ${canContact ? html`<a class="back-link" href="/messages/new">Написать в учебный офис</a>` : ''}
          ` : ''}
        </section>
      ` : html`<p class="section-empty">Основание обучения ещё не указано.</p>`}
    </main>`, { student, csrf, active: 'tuition' });
}

function todayPanel({ db, studentId, schoolDay }) {
  const tuition = tuitionForStudent(db, studentId);
  if (tuition?.funding !== 'paid') return '';
  return html`
    <section class="today-panel request-attention" aria-labelledby="today-tuition">
      <h2 id="today-tuition">${tuition.due_date < schoolDay.date ? 'Срок оплаты прошёл' : 'Срок оплаты обучения'}</h2>
      <p>${dueDate(tuition.due_date)}</p>
      <a href="/tuition">Открыть оплату обучения</a>
    </section>`;
}

export default {
  id: 'tuition',
  demoUpgrade: true,
  services: { calendarEvents, tuitionForStudent },
  todayPanel,
  studentMount({ db, currentSchoolDay }) {
    const routes = new Hono();
    const canContact = modulesFor(db).has('messages');
    routes.get('/', c => c.html(tuitionPage(tuitionForStudent(db, c.get('studentId')), {
      student: c.get('student'), csrf: c.get('csrfToken'), canContact, date: currentSchoolDay().date,
    })));
    return ['/tuition', routes];
  },
  navigation: group => group === 'studentServices'
    ? [[61, '/tuition', 'Оплата обучения', 'tuition']] : [],
};
