import { html } from 'hono/html';
import { layout } from '../ui/layout.js';
import { pluralRu } from '../ui/plural.js';
import { formatDate } from '../ui/format.js';

const stateLabels = { draft: 'Черновик', published: 'Действующая', archived: 'Архив' };
const groupPath = code => `/office/curriculum/groups/${encodeURIComponent(code)}`;
const page = (title, body, context) => layout(title, html`<main id="content" class="page office-page">${body}</main>`,
  { ...context, active: 'curriculum' });

function versionBadge(state) {
  return html`<span class="status-pill${state === 'published' ? ' is-ready' : ''}">${stateLabels[state]}</span>`;
}

export function curriculumPage(groups, context) {
  return page('Учебные планы групп', html`
    <header class="identity"><p class="eyebrow">Образовательные программы</p><h1>Учебные планы групп</h1></header>
    ${groups.length ? html`<ul class="office-records" role="list">${groups.map(group => html`<li>
      <div><a href="${groupPath(group.code)}">${group.code}</a>
        <p>${group.program} · ${group.year} курс · ${group.courses} ${pluralRu(group.courses, 'дисциплина', 'дисциплины', 'дисциплин')} в действующем плане</p></div>
      <div class="office-buttons">
        ${group.published ? html`<span class="status-pill is-ready">Версия № ${group.published}</span>` : ''}
        ${group.draft ? html`<a href="/office/curriculum/${group.draft}">Открыть черновик</a>` : ''}
      </div></li>`)}</ul>` : html`<p>Сначала <a href="/office/registry">добавьте группу</a>.</p>`}
  `, context);
}

export function groupCurriculumPage(group, versions, context) {
  const draft = versions.find(version => version.state === 'draft');
  return page(`Версии ${group.code}`, html`
    <a class="back-link" href="/office/curriculum">Учебные планы групп</a>
    <header class="identity directory-title">
      <div><p class="eyebrow">${group.program} · ${group.year} курс</p><h1>Версии плана · ${group.code}</h1></div>
      ${draft ? html`<a class="button-link primary" href="/office/curriculum/${draft.id}">Открыть черновик</a>` : html`
        <form method="post" action="${groupPath(group.code)}/draft">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          <button class="primary">Создать черновик</button>
        </form>`}
    </header>
    ${versions.length ? html`<ul class="office-records" role="list">${versions.map(version => html`<li>
      <div><a href="/office/curriculum/${version.id}">Версия № ${version.version}</a>
        ${version.published_at ? html`<p>Опубликована ${formatDate(version.published_at)}${version.publisher ? ` · ${version.publisher}` : ''}</p>` : ''}</div>
      ${versionBadge(version.state)}</li>`)}</ul>` : html`<p class="section-empty">Версионирование начнётся при создании черновика.</p>`}
  `, context);
}

function changeText(course) {
  if (course.before === null) return `Добавляется · ${course.after} з. е.`;
  if (course.after === null) return `Убирается из действующего плана · ${course.before} з. е.`;
  return `Кредиты · ${course.before} → ${course.after} з. е.`;
}

export function versionPage(version, context, error = '') {
  const draft = version.state === 'draft';
  const coursesPath = `/office/curriculum/${version.id}/courses`;
  return page(`Версия плана № ${version.version}`, html`
    <a class="back-link" href="${groupPath(version.group_code)}">Все версии группы</a>
    <header class="identity directory-title">
      <div><p class="eyebrow">${version.group.program} · ${version.group_code}</p><h1>Версия № ${version.version}</h1></div>
      ${versionBadge(version.state)}
    </header>
    ${error ? html`<p class="error" role="alert">${error}</p>` : ''}
    ${draft ? html`
      <section class="office-queue curriculum-compare" aria-labelledby="compare-title">
        <h2 id="compare-title">Что изменится после публикации</h2>
        ${version.changes.length ? html`<ul class="office-records" role="list">${version.changes.map(course => html`
          <li><div><strong>${course.subject}</strong><p>${course.assessment}</p></div>
            <span>${changeText(course)}</span></li>`)}</ul>`
          : html`<p>Состав черновика совпадает с действующим планом группы.</p>`}
        <p class="hint">Выставленные оценки и их зачётные единицы сохраняются в личных планах.</p>
        <form class="form-panel" method="post" action="/office/curriculum/${version.id}/publish">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          <input type="hidden" name="revision" value="${version.revision}">
          <button class="primary">Опубликовать для группы ${version.group_code}</button>
        </form>
      </section>` : ''}
    <div class="registry-grid">
      <section class="office-queue" id="courses">
        <h2>Обязательные дисциплины</h2>
        ${version.courses.length ? html`<ul class="office-records" role="list">${version.courses.map(course => html`
          <li><div><strong>${course.subject}</strong><p>${course.assessment} · ${course.credits} з. е.</p></div>
            ${draft ? html`<form method="post" action="${coursesPath}">
              <input type="hidden" name="_csrf" value="${context.csrf}">
              <input type="hidden" name="subject" value="${course.subject}">
              <input type="hidden" name="assessment" value="${course.assessment}">
              <button class="secondary" name="action" value="remove" aria-label="Убрать · ${course.subject}">Убрать</button>
            </form>` : ''}
          </li>`)}</ul>` : html`<p class="section-empty">Дисциплины ещё не добавлены.</p>`}
      </section>
      ${draft ? html`<section class="office-queue">
        <h2>Добавить или изменить дисциплину</h2>
        <p class="hint">Совпадение названия и формы контроля обновит зачётные единицы в черновике.</p>
        <form class="form-panel" method="post" action="${coursesPath}">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          <label for="course-subject">Дисциплина</label>
          <input id="course-subject" name="subject" maxlength="150" required>
          <label for="course-assessment">Форма контроля</label>
          <input id="course-assessment" name="assessment" list="assessment-types" maxlength="100" required>
          <datalist id="assessment-types"><option value="Экзамен"><option value="Зачёт">
            <option value="Дифференцированный зачёт"></datalist>
          <label for="course-credits">Зачётные единицы</label>
          <input id="course-credits" name="credits" type="number" min="1" required>
          <button class="secondary" name="action" value="save">Сохранить дисциплину</button>
        </form>
      </section>` : ''}
    </div>`, context);
}
