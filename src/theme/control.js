import { html } from 'hono/html';
export { localReturnPath as themeReturnPath } from '../ui/return-path.js';

const sun = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
  stroke-linecap="round" aria-hidden="true">
  <circle cx="12" cy="12" r="4"/>
  <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42m-11.3 11.3-1.42 1.42"/>
</svg>`;
const moon = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M20.98 12.42a9 9 0 1 1-9.4-9.4 7 7 0 0 0 9.4 9.4Z"/>
</svg>`;

export function themeSwitch({ theme, returnTo }, csrf) {
  const dark = theme === 'dark';
  return html`<form class="theme-switch-form" method="post" action="/settings/theme">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="hidden" name="theme" value="${dark ? 'light' : 'dark'}">
    ${returnTo ? html`<input type="hidden" name="returnTo" value="${returnTo}">` : ''}
    <button type="submit" class="theme-switch" role="switch" aria-label="Тёмная тема"
      aria-checked="${dark ? 'true' : 'false'}" title="${dark ? 'Включить светлую тему' : 'Включить тёмную тему'}">
      ${sun}${moon}
    </button>
  </form>`;
}
