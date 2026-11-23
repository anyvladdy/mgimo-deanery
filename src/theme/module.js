import { readFileSync } from 'node:fs';
import { Hono } from 'hono';
import { messagePage } from '../ui/layout.js';
import { themeReturnPath, themeSwitch } from './control.js';

const stylesheet = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

export function themeForStudent(db, studentId) {
  if (!studentId) return 'light';
  return db.prepare('SELECT theme FROM student_themes WHERE student_id = ?').get(studentId)?.theme ?? 'light';
}

export default {
  id: 'theme',
  services: { themeForStudent, themeSwitch },
  publicMount() {
    const routes = new Hono();
    routes.get('/', c => c.body(stylesheet, 200, { 'Content-Type': 'text/css; charset=utf-8' }));
    return ['/assets/theme.css', routes];
  },
  studentMount({ db }) {
    const routes = new Hono();
    const save = db.prepare(`
      INSERT INTO student_themes (student_id, theme) VALUES (?, ?)
      ON CONFLICT(student_id) DO UPDATE SET theme = excluded.theme
    `);
    routes.get('/', c => c.redirect('/profile', 303));
    routes.post('/', c => {
      const { theme, returnTo } = c.get('form');
      const destination = themeReturnPath(returnTo) ?? '/profile';
      if (theme !== 'light' && theme !== 'dark') {
        return c.html(messagePage('Тема оформления', 'Выберите светлую или тёмную тему.',
          destination, 'Вернуться в кабинет', { student: c.get('student'), csrf: c.get('csrfToken') }), 422);
      }
      save.run(c.get('studentId'), theme);
      return c.redirect(destination, 303);
    });
    return ['/settings/theme', routes];
  },
};
