import { html } from 'hono/html';
import { parseTimestamp, schoolDayAt } from '../modules/clock.js';
import { formatDate, timestamp } from '../ui/format.js';
import { layout } from '../ui/layout.js';
import { bodyLimit, subjectLimit } from './messages.js';

const channelName = {
  office: 'Учебный офис',
  technical: 'Технический вопрос',
  teacher: 'Преподаватель',
};

function page(title, content, context, conversation = false) {
  return layout(title, html`<main class="page messages-page${conversation ? ' conversation-page' : ''}" id="content">${content}</main>`,
    { ...context, active: 'messages', prototypeInFooter: conversation });
}

function participant(thread, context) {
  if (context.staff) return `${thread.student_name} · ${channelName[thread.channel]}`;
  if (thread.channel === 'teacher') return `Преподаватель · ${thread.teacher_name}`;
  return thread.channel === 'technical' ? 'Технический вопрос · учебный офис' : channelName.office;
}

function threadStatus(thread, staff) {
  if (thread.closed_at) return html`<span class="status-pill is-ready">Решено</span>`;
  if (!thread.can_reply) return html`<span class="status-pill">Только просмотр</span>`;
  const label = staff
    ? (thread.last_from_staff ? 'Ответ отправлен' : 'Нужен ответ')
    : (thread.last_from_staff ? 'Есть ответ' : 'Ожидается ответ');
  const tone = thread.last_from_staff ? ' is-ready' : staff ? ' is-warning' : '';
  return html`<span class="status-pill${tone}">${label}</span>`;
}

const officeViewer = context => ['office', 'admin'].includes(context.staff?.role);

export function inboxPage(context, threads, view) {
  return page('Сообщения', html`
    <header class="identity directory-title">
      <h1>Сообщения</h1>
      ${context.student ? html`<a class="button-link primary" href="/messages/new">Написать сообщение</a>` : ''}
    </header>
    ${officeViewer(context) ? html`<nav class="section-links" aria-label="Состояние обращений">
      <a href="/office/messages" aria-current="${view ? 'false' : 'page'}">Все</a>
      <a href="/office/messages?view=waiting" aria-current="${view === 'waiting' ? 'page' : 'false'}">Нужен ответ</a>
      <a href="/office/messages?view=closed" aria-current="${view === 'closed' ? 'page' : 'false'}">Решено</a>
    </nav>` : ''}
    ${threads.length ? html`<ul class="message-inbox" role="list">
      ${threads.map(thread => html`<li>
        <a class="message-link" href="${context.base}/${thread.id}" aria-labelledby="thread-subject-${thread.id}">
          <div class="message-link-heading">
            <strong id="thread-subject-${thread.id}">${thread.subject}</strong>
            ${threadStatus(thread, context.staff)}
          </div>
          <p>${participant(thread, context)}</p>
          ${thread.assignee ? html`<p>Ответственный · ${thread.assignee}</p>` : ''}
          <p>${timestamp(thread.updated_at)}</p>
        </a>
      </li>`)}
    </ul>` : html`
      <p class="section-empty">${context.student
        ? (context.teacherAssignments ? 'Здесь появятся ваши обращения, переписка с преподавателями и ответы.'
          : 'Здесь появятся ваши обращения и ответы учебного офиса.')
        : view === 'waiting' ? 'Нет обращений, требующих ответа.'
          : view === 'closed' ? 'Закрытых обращений пока нет.' : 'Входящих сообщений пока нет.'}</p>`}
  `, context);
}

const fields = { recipient: 'Кому', subject: 'Тема', body: 'Сообщение' };
const fieldId = field => `message-${field}`;

function errorAttributes(field, errors) {
  return errors[field] ? html`aria-invalid="true" aria-describedby="${fieldId(field)}-error"` : '';
}

function errorText(field, errors) {
  return errors[field] ? html`<p class="hint" id="${fieldId(field)}-error">${errors[field]}</p>` : '';
}

export function composePage(context, teachers, input, errors = {}, issue = '') {
  const option = (value, label) => input.recipient === value
    ? html`<option value="${value}" selected>${label}</option>`
    : html`<option value="${value}">${label}</option>`;
  const invalid = Object.keys(errors);
  return page('Новое сообщение', html`
    <a class="back-link" href="/messages">Все сообщения</a>
    <header class="identity"><h1>Новое сообщение</h1></header>
    <form class="form-panel message-compose" method="post" action="/messages">
      <input type="hidden" name="_csrf" value="${context.csrf}">
      <input type="hidden" name="key" value="${input.key}">
      ${issue || invalid.length ? html`<div class="error" role="alert" tabindex="-1" autofocus>
        <p>${issue || 'Проверьте поля сообщения.'}</p>
        ${invalid.length ? html`<ul>${invalid.map(field => html`
          <li><a href="#${fieldId(field)}">${fields[field]}: ${errors[field]}</a></li>`)}</ul>` : ''}
      </div>` : ''}
      <label for="message-recipient">Кому</label>
      <select id="message-recipient" name="recipient" required ${errorAttributes('recipient', errors)}>
        ${!input.recipient ? html`<option value="" selected disabled>Выберите получателя</option>` : ''}
        ${option('office', 'Учебный офис')}
        ${option('technical', 'Технический вопрос · учебный офис')}
        ${teachers.length ? html`<optgroup label="Преподаватели вашей группы">
          ${teachers.map(teacher => option(`teacher-${teacher.id}`, `${teacher.name} · ${teacher.subjects.join(', ')}`))}
        </optgroup>` : ''}
      </select>
      ${errorText('recipient', errors)}
      ${context.teacherAssignments && !teachers.length ? html`<p class="hint">Преподаватели для вашей группы пока недоступны в переписке.</p>` : ''}
      <label for="message-subject">Тема</label>
      <input id="message-subject" name="subject" value="${input.subject}" required maxlength="${subjectLimit}" ${errorAttributes('subject', errors)}>
      ${errorText('subject', errors)}
      <label for="message-body">Сообщение</label>
      <textarea id="message-body" name="body" rows="6" required maxlength="${bodyLimit}" ${errorAttributes('body', errors)}>${input.body}</textarea>
      ${errorText('body', errors)}
      <button class="primary">Отправить</button>
    </form>
  `, context);
}

function historyByDay(messages) {
  const days = [];
  for (const message of messages) {
    const instant = parseTimestamp(message.created_at);
    const { date, time } = schoolDayAt(instant);
    if (days.at(-1)?.date !== date) days.push({ date, messages: [] });
    days.at(-1).messages.push({ ...message, timestamp: instant.toISOString(), time: time.slice(0, 5) });
  }
  return days;
}

function messageBubble(context, thread, message) {
  const own = message.staff_id === (context.staff?.id ?? null);
  const role = own ? 'Вы' : !message.staff_id ? 'Студент'
    : thread.channel === 'teacher' ? 'Преподаватель' : 'Учебный офис';
  return html`<li id="message-${message.id}" tabindex="-1" class="message-bubble${own ? ' is-own' : ''}"
    aria-labelledby="message-${message.id}-meta" aria-describedby="message-${message.id}-body">
    <p class="message-meta" id="message-${message.id}-meta">
      <span class="message-author"><strong>${message.author}</strong> · ${role}</span>
      <time datetime="${message.timestamp}">${message.time}</time>
    </p>
    <p class="message-text" id="message-${message.id}-body">${message.body}</p>
  </li>`;
}

export function conversationPage(context, thread, messages, reply) {
  const canManage = officeViewer(context) && !thread.closed_at;
  const canClose = canManage && thread.last_from_staff
    && (!thread.assigned_to || context.staff.id === thread.assigned_to || context.staff.role === 'admin');
  const canReply = thread.can_reply && (!thread.closed_at || context.student);
  const replyHint = thread.closed_at ? 'Отправьте сообщение, чтобы вернуть обращение в работу.'
    : context.student && thread.last_from_staff && thread.channel !== 'teacher'
      ? 'Здесь можно уточнить вопрос у учебного офиса.' : '';
  return page(thread.subject, html`
    <div class="conversation-links">
      <a class="back-link" href="${context.base}">Все сообщения</a>
      ${canReply && messages.length > 4 ? html`<a class="back-link" href="#reply-body">К форме ответа</a>` : ''}
    </div>
    <header class="identity conversation-heading">
      <p class="eyebrow">${participant(thread, context)}</p>
      <h1>${thread.subject}</h1>
      <div class="conversation-status">
        ${threadStatus(thread, context.staff)}
        ${thread.assignee ? html`<p class="hint">Ответственный · ${thread.assignee}</p>` : ''}
      </div>
      ${canManage && (!thread.assigned_to || canClose) ? html`
        <form class="office-buttons" method="post" action="${context.base}/${thread.id}/case">
          <input type="hidden" name="_csrf" value="${context.csrf}">
          ${!thread.assigned_to ? html`<button class="secondary" name="action" value="assign">Взять в работу</button>` : ''}
          ${canClose ? html`<button class="secondary" name="action" value="close">Отметить решённым</button>` : ''}
        </form>` : ''}
    </header>
    ${reply.issue ? html`<p class="error" role="alert">${reply.issue}</p>` : ''}
    <div class="conversation-history" role="group" aria-label="История переписки">
      ${historyByDay(messages).map(day => html`
        <div class="message-day">
          <h2 class="message-day-heading"><time datetime="${day.date}">${formatDate(day.date)}</time> · МСК</h2>
          <ol class="message-history" role="list">
            ${day.messages.map(message => messageBubble(context, thread, message))}
          </ol>
        </div>`)}
    </div>
    ${canReply ? html`
      <form class="form-panel message-compose message-reply" method="post" action="${context.base}/${thread.id}/reply">
        <input type="hidden" name="_csrf" value="${context.csrf}">
        <input type="hidden" name="key" value="${reply.key}">
        <label for="reply-body">${thread.closed_at ? 'Продолжить обращение' : 'Ваш ответ'}</label>
        ${replyHint ? html`<p class="hint" id="reply-hint">${replyHint}</p>` : ''}
        ${reply.error ? html`<p class="error" id="reply-error">${reply.error}</p>` : ''}
        <textarea id="reply-body" name="body" rows="3" required maxlength="${bodyLimit}"
          ${reply.error ? html`aria-invalid="true" autofocus` : ''}
          ${reply.error || replyHint ? html`aria-describedby="${[reply.error && 'reply-error', replyHint && 'reply-hint'].filter(Boolean).join(' ')}"` : ''}>${reply.body ?? ''}</textarea>
        <button class="primary">Отправить ответ</button>
      </form>` : !thread.can_reply ? html`
      <p class="section-empty">Преподаватель сейчас недоступен для ответа.
        ${context.student ? html`<a href="/messages/new">Написать в учебный офис</a>` : ''}
      </p>` : ''}
  `, context, true);
}
