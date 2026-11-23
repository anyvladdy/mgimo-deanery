import { Hono } from 'hono';
import { html } from 'hono/html';
import { layout } from '../ui/layout.js';

export default {
  id: 'in-development',
  studentMount() {
    const routes = new Hono();
    routes.get('/', c => c.html(layout('В разработке', html`
      <main class="page narrow" id="content">
        <a class="back-link" href="/services">Сервисы</a>
        <header class="identity"><h1>В разработке</h1></header>
        <section class="today-panel" aria-labelledby="upcoming-evaluation">
          <h2 id="upcoming-evaluation">СОП</h2>
          <p>Студенческая оценка преподавания. Обязательный анонимный опрос о качестве занятий.</p>
        </section>
        <section class="today-panel" aria-labelledby="upcoming-feedback">
          <h2 id="upcoming-feedback">Благодарности и предложения</h2>
          <p>Здесь можно будет поблагодарить за работу или поделиться мнением о преподавании и инфраструктуре.</p>
          <p>Сообщение получит только выбранный адресат. Можно будет отправить его с указанием имени или анонимно.</p>
        </section>
      </main>`, { student: c.get('student'), csrf: c.get('csrfToken'), active: 'in-development' })));
    return ['/services/in-development', routes];
  },
  navigation: group => group === 'studentServices' ? [[100, '/services/in-development', 'В разработке', 'in-development']] : [],
};
