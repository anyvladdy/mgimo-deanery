import { Hono } from 'hono';
import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

function studentCardPage(student, card, csrf) {
  const details = [
    ['Номер билета', card?.card_number ?? 'Ещё не присвоен'],
    ['Программа', student.program || 'Не указана'],
    ['Группа', student.group_code || 'Не указана'],
    ['Факультет', student.faculty || 'Не указан'],
    ['Курс', student.year || 'Не указан'],
  ];
  return layout('Студенческий билет', html`
    <main id="content" class="page narrow">
      <header class="identity"><h1>Студенческий билет</h1></header>
      <article class="today-panel" aria-labelledby="card-name">
        <p class="status-pill">Демонстрационный билет</p>
        <h2 id="card-name">${student.full_name || 'ФИО ещё не указано'}</h2>
        <dl>${details.map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>
      </article>
    </main>`, { student, csrf, active: 'student-card' });
}

export default {
  id: 'student-card',
  demoUpgrade: true,
  studentMount({ db }) {
    const routes = new Hono();
    const cardForStudent = db.prepare('SELECT card_number FROM student_cards WHERE student_id = ?');
    routes.get('/', c => c.html(studentCardPage(
      c.get('student'), cardForStudent.get(c.get('studentId')), c.get('csrfToken'),
    )));
    return ['/student-card', routes];
  },
  navigation(group) {
    if (group === 'studentHeader') return [[30, '/student-card', 'Студбилет', 'student-card']];
    if (group === 'studentServices') return [[60, '/student-card', 'Студенческий билет', 'student-card']];
    return [];
  },
};
