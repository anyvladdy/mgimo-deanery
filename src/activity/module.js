import { Hono } from 'hono';
import { html } from 'hono/html';
import { timestamp } from '../ui/format.js';
import { layout } from '../ui/layout.js';

const actionLabels = {
  login: 'Вход в кабинет',
  request: 'Действие с заявкой',
  notice: 'Отметка об уведомлении',
  message: 'Действие с сообщением',
  course: 'Выбор курса',
  event: 'Действие с мероприятием',
  booking: 'Действие с бронированием',
  deadline: 'Действие с дедлайном',
  theme: 'Выбор темы оформления',
  integration: 'Настройка интеграции',
};
const actionDetails = {
  event: { register: 'Запись на мероприятие', cancel: 'Отмена записи на мероприятие' },
  booking: { create: 'Бронирование аудитории', cancel: 'Отмена брони аудитории' },
  deadline: { create: 'Создание дедлайна', complete: 'Выполнение дедлайна', delete: 'Удаление дедлайна' },
  integration: { issue: 'Выпуск токена ассистента', revoke: 'Отзыв доступа ассистента' },
};
const latestCount = 30;

export function recordActivity(db, studentId, kind, action = null) {
  if (typeof kind !== 'string' || !Object.hasOwn(actionLabels, kind)) return false;
  if (action !== null && (typeof action !== 'string' || !Object.hasOwn(actionDetails[kind] ?? {}, action))) return false;
  return db.prepare(`
    INSERT INTO student_activity (student_id, kind, created_at, action) VALUES (?, ?, deanery_timestamp(), ?)
  `).run(studentId, kind, action).changes === 1;
}

function activityPage(entries, student, csrf) {
  return layout('История действий', html`
    <main id="content" class="page narrow">
      <header class="identity"><h1>История действий</h1></header>
      ${entries.length ? html`
        <ol class="office-records" role="list" aria-label="Последние действия">
          ${entries.map(entry => html`
            <li><div><strong>${actionDetails[entry.kind]?.[entry.action] ?? actionLabels[entry.kind]}</strong><p>${timestamp(entry.created_at)}</p></div></li>
          `)}
        </ol>
      ` : html`<p class="section-empty">В истории пока нет действий.</p>`}
    </main>`, { student, csrf, active: 'activity' });
}

export default {
  id: 'activity',
  services: { recordActivity },
  migrations: [db => db.exec('ALTER TABLE student_activity ADD COLUMN action TEXT')],
  studentMount({ db }) {
    const routes = new Hono();
    const latest = db.prepare(`
      SELECT kind, action, created_at FROM student_activity
      WHERE student_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
    `);
    routes.get('/', c => c.html(activityPage(
      latest.all(c.get('studentId'), latestCount), c.get('student'), c.get('csrfToken'),
    )));
    return ['/activity', routes];
  },
  navigation: group => group === 'studentServices'
    ? [[63, '/activity', 'История действий', 'activity']] : [],
};
