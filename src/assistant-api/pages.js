import { html } from 'hono/html';
import { timestamp } from '../ui/format.js';
import { layout } from '../ui/layout.js';

export function integrationsPage({ student, csrf, token, expiresAt, revoked }) {
  const active = expiresAt > Date.now();
  return layout('Личный ассистент', html`
    <main id="content" class="page narrow">
      <header class="identity"><h1>Личный ассистент</h1></header>
      <section class="today-panel" aria-labelledby="assistant-access">
        <h2 id="assistant-access">Доступ к срокам</h2>
        <p>Подключите ассистента, чтобы он мог проверять ваши дедлайны и сроки оплаты.</p>
        ${active ? html`<p>Токен действует до ${timestamp(new Date(expiresAt).toISOString())}.</p>`
          : revoked ? html`<p role="status">Доступ отозван.</p>`
            : html`<p>${expiresAt ? 'Срок действия токена истёк.' : 'Токен ещё не выпущен.'}</p>`}
        ${token ? html`
          <div class="form-panel">
            <p id="assistant-token-help" role="status">Выделите токен и скопируйте его сейчас. Он показывается один раз.</p>
            <label for="assistant-token">Токен доступа</label>
            <textarea id="assistant-token" rows="2" readonly aria-describedby="assistant-token-help">${token}</textarea>
          </div>` : ''}
        <div class="office-buttons">
          <form action="/integrations/token" method="post">
            <input type="hidden" name="_csrf" value="${csrf}">
            <button type="submit" class="primary">${active ? 'Заменить токен' : 'Выпустить токен'}</button>
          </form>
          ${active ? html`
            <form action="/integrations/revoke" method="post">
              <input type="hidden" name="_csrf" value="${csrf}">
              <button type="submit" class="secondary">Отозвать токен</button>
            </form>` : ''}
        </div>
        <p><a href="/api/v1/openapi.json" download="deanery-openapi.json">Скачать спецификацию OpenAPI</a></p>
        <p>Загрузите спецификацию в ассистента, укажите токен для Bearer-аутентификации и настройте регулярную проверку сроков в его расписании.</p>
      </section>
    </main>`, { student, csrf, active: 'assistant-api' });
}
