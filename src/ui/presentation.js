import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { html, raw } from 'hono/html';
import { createElement as element } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localReturnPath } from './return-path.js';

const presentation = new AsyncLocalStorage();
const cookieName = 'deanery_design';
const modes = [
  ['auto', 'Автоматически'],
  ['full', 'Полная версия'],
  ['lite', 'Облегчённая версия'],
];
const validMode = value => modes.some(([mode]) => mode === value);
const markup = (component, props) => raw(renderToStaticMarkup(element(component, props)));

export const designLoader = readFileSync(new URL('./design-loader.js', import.meta.url), 'utf8');
const loaderHash = createHash('sha256').update(designLoader).digest();
export const designLoaderIntegrity = `sha256-${loaderHash.toString('base64')}`;
export const designLoaderUrl = `/assets/design.js?v=${loaderHash.toString('hex').slice(0, 12)}`;
export const fullStylesheet = readFileSync(new URL('./carbon.css', import.meta.url), 'utf8');
const stylesheetVersion = createHash('sha256').update(fullStylesheet).digest('hex').slice(0, 12);
export const fullStylesheetUrl = `/assets/carbon.css?v=${stylesheetVersion}`;

export function withPresentation(c, next) {
  const cookie = getCookie(c, cookieName);
  const mode = validMode(cookie) ? cookie : 'auto';
  const query = new URL(c.req.url);
  const variant = mode === 'auto' && (c.req.header('Save-Data') ?? '').toLowerCase() === 'on' ? 'lite' : mode;
  const getCsrf = () => c.get('csrfToken');
  return presentation.run({ mode, variant, getCsrf, returnTo: query.pathname + query.search }, next);
}

export const presentationVariant = () => presentation.getStore()?.variant ?? 'lite';

export function savePresentation(c, secure) {
  const { mode, returnTo } = c.get('form');
  if (!validMode(mode)) return c.text('Выберите режим оформления.', 422);
  const options = { path: '/', httpOnly: true, sameSite: 'Lax', secure };
  if (mode === 'auto') deleteCookie(c, cookieName, options);
  else setCookie(c, cookieName, mode, { ...options, maxAge: 60 * 60 * 24 * 365 });
  return c.redirect(localReturnPath(returnTo) ?? '/', 303);
}

export function presentationControl() {
  const context = presentation.getStore();
  const csrf = context?.getCsrf();
  if (!csrf) return '';
  return html`<form class="design-control" method="post" action="/settings/design">
    <input type="hidden" name="_csrf" value="${csrf}">
    <input type="hidden" name="returnTo" value="${context.returnTo}">
    <label for="design-mode">Версия сайта</label>
    <select name="mode" id="design-mode">
      ${modes.map(([mode, label]) => html`<option value="${mode}" ${mode === context.mode ? 'selected' : ''}>${label}</option>`)}
    </select>
    <button type="submit" class="quiet-button">Применить</button>
  </form>`;
}

function NavigationLinks({ items, active }) {
  return element('ul', { className: 'design-links' }, items.map(([href, label, key]) =>
    element('li', { key }, element('a', { href, 'aria-current': key === active ? 'page' : undefined }, label))));
}

function StudentNavigation({ items, active }) {
  const railItems = items.filter(([, , , section]) => section !== 'header' && section !== 'home');
  const sections = Map.groupBy(railItems, ([, , , section]) => section === 'week' || section === 'study' ? section : 'cabinet');
  const groups = [
    ['Учебная неделя', sections.get('week')],
    ['Учёба', sections.get('study')],
    ['Кабинет', sections.get('cabinet')],
  ].filter(([, links]) => links?.length);
  const openGroup = groups.find(([, links]) => links.some(([, , key]) => key === active)) ?? groups[0];
  return element('nav', { className: 'design-rail', hidden: true, 'aria-label': 'Разделы личного кабинета' },
    groups.map(group => {
      const [label, links] = group;
      return element('details', { className: 'design-nav-group', key: label, open: group === openGroup },
        element('summary', null, label), element(NavigationLinks, { items: links, active }));
    }));
}

export function studentNavigation(props) {
  if (presentationVariant() === 'lite') return '';
  return markup(StudentNavigation, props);
}

function WeekTabs({ active, scheduleHref, calendarHref }) {
  const tabs = [
    [scheduleHref, 'Пары группы', 'schedule'],
    [calendarHref, 'Личный календарь', 'calendar'],
  ];
  return element('nav', { className: 'design-week-tabs', hidden: true, 'aria-label': 'Вид учебной недели' },
    element(NavigationLinks, { items: tabs, active }));
}

export function weekNavigation(active, scheduleHref, calendarHref) {
  if (presentationVariant() === 'lite' || !scheduleHref || !calendarHref) return '';
  return markup(WeekTabs, { active, scheduleHref, calendarHref });
}

function CalendarDays({ days }) {
  return element('ul', { className: 'week-picker design-calendar-days', 'aria-label': 'Дни недели' },
    days.map(({ date, weekday, number, count }) => element('li', { key: date },
      element('a', { href: `#day-${date}`, 'aria-label': `${weekday}, ${number}. Событий: ${count}` },
        element('span', null, weekday), element('strong', null, number),
        element('span', { className: 'design-day-count' }, count || '—')))));
}

export function calendarNavigation(days) {
  return markup(CalendarDays, { days });
}
