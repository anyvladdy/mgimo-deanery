import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { modulesFor } from '../modules/config.js';
import { contactContext } from './context.js';
import { messagePage } from '../ui/layout.js';
import { assignedTeachers, bodyLimit, createThread, findThread, listThreads, replyToThread, subjectLimit, threadHistory, updateCase } from './messages.js';
import { composePage, conversationPage, inboxPage } from './pages.js';

const idFrom = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0;
const keyIsValid = value => typeof value === 'string'
  && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(value);
const fieldValue = (value, limit) => typeof value === 'string' ? value.slice(0, limit).replaceAll('\0', '') : '';
const validText = (value, limit) => typeof value === 'string' && value.length <= limit && !value.includes('\0') && value.trim() !== '';
const bodyError = `Введите сообщение длиной до ${bodyLimit} символов.`;

function destination(value) {
  if (value === 'office' || value === 'technical') return { channel: value, teacherId: null };
  if (typeof value !== 'string' || !value.startsWith('teacher-')) return null;
  const teacherId = idFrom(value.slice('teacher-'.length));
  return teacherId ? { channel: 'teacher', teacherId } : null;
}

export function messageRoutes(db, { staffMode = false } = {}) {
  const routes = new Hono();
  const teacherAssignments = modulesFor(db).has('gradebook');
  const base = staffMode ? '/office/messages' : '/messages';
  const context = c => ({
    base, teacherAssignments, csrf: c.get('csrfToken'),
    student: staffMode ? null : c.get('student'),
    staff: staffMode ? c.get('staff') : null,
  });
  const viewer = c => staffMode ? c.get('staff') : { role: 'student', id: c.get('studentId') };
  const missing = c => c.html(messagePage('Переписка не найдена', 'Откройте нужную переписку из списка.',
    base, 'К сообщениям', { ...context(c), active: 'messages' }), 404);

  routes.get('/', c => {
    const identity = viewer(c);
    const requested = c.req.query('view');
    const office = ['office', 'admin'].includes(identity.role);
    const view = office && ['waiting', 'closed'].includes(requested) ? requested : '';
    return c.html(inboxPage(context(c), listThreads(db, identity, view), view));
  });
  if (!staffMode) {
    routes.get('/new', c => {
      const studentId = c.get('studentId');
      const prefill = contactContext(db, studentId, assignedTeachers(db, studentId), c.req.query());
      if (!prefill) return c.html(messagePage('Получатель недоступен', 'Откройте форму и выберите доступного получателя.',
        '/messages/new', 'Написать сообщение', { ...context(c), active: 'messages' }), 404);
      return c.html(composePage(context(c), prefill.teachers,
        { key: randomUUID(), recipient: prefill.recipient, subject: prefill.subject, body: '' }));
    });

    routes.post('/', c => {
      const studentId = c.get('studentId');
      const form = c.get('form');
      const target = destination(form.recipient);
      const validKey = keyIsValid(form.key);
      const key = validKey ? form.key : randomUUID();
      const input = { key, recipient: target ? form.recipient : 'office',
        subject: fieldValue(form.subject, subjectLimit), body: fieldValue(form.body, bodyLimit) };
      const errors = {};
      if (!target) errors.recipient = 'Выберите получателя из списка.';
      if (!validText(form.subject, subjectLimit)) errors.subject = `Введите тему длиной до ${subjectLimit} символов.`;
      if (!validText(form.body, bodyLimit)) errors.body = bodyError;
      const showForm = (issue = '') => c.html(composePage(context(c), assignedTeachers(db, studentId),
        input, errors, issue), 422);
      if (!validKey) return showForm('Обновите форму или отправьте сообщение ещё раз.');
      if (Object.keys(errors).length) return showForm();
      const id = createThread(db, studentId, { ...target, key, subject: input.subject.trim(), body: input.body.trim() });
      if (!id) {
        errors.recipient = teacherAssignments ? 'Выберите преподавателя, назначенного вашей группе.' : 'Выберите получателя из списка.';
        return showForm();
      }
      return c.redirect(`${base}/${id}`, 303);
    });
  }

  const showThread = (c, thread, reply, status = 200) => c.html(conversationPage(
    context(c), thread, threadHistory(db, viewer(c), thread.id), reply,
  ), status);
  routes.get('/:id', c => {
    const thread = findThread(db, viewer(c), idFrom(c.req.param('id')));
    return thread ? showThread(c, thread, { key: randomUUID() }) : missing(c);
  });
  routes.post('/:id/reply', c => {
    const identity = viewer(c);
    const thread = findThread(db, identity, idFrom(c.req.param('id')));
    if (!thread) return missing(c);
    if (!thread.can_reply || (staffMode && thread.closed_at)) return showThread(c, thread, {}, 409);
    const { body, key } = c.get('form');
    const validKey = keyIsValid(key);
    if (!validKey || !validText(body, bodyLimit)) {
      return showThread(c, thread, {
        body: fieldValue(body, bodyLimit), key: validKey ? key : randomUUID(),
        error: validKey ? bodyError : 'Отправьте сообщение ещё раз.',
      }, 422);
    }
    const messageId = replyToThread(db, identity, thread.id, body.trim(), key);
    if (!messageId) {
      const current = findThread(db, identity, thread.id);
      if (!current) return missing(c);
      if (!current.can_reply || (staffMode && current.closed_at)) return showThread(c, current, {}, 409);
      return showThread(c, current, {
        body, key: randomUUID(), error: 'Обновили форму. Отправьте сообщение ещё раз.',
      }, 409);
    }
    return c.redirect(`${base}/${thread.id}#message-${messageId}`, 303);
  });
  if (staffMode) routes.post('/:id/case', c => {
    const identity = viewer(c);
    const id = idFrom(c.req.param('id'));
    const result = updateCase(db, identity, id, c.get('form').action);
    if (result === 'missing') return missing(c);
    if (result === 'ok') return c.redirect(`${base}/${id}`, 303);
    const errors = {
      assigned: 'У обращения уже есть ответственный или оно закрыто.',
      unanswered: 'Отправьте ответ студенту перед закрытием.',
      invalid: 'Выберите действие в карточке обращения.',
    };
    return showThread(c, findThread(db, identity, id), { key: randomUUID(), issue: errors[result] },
      result === 'invalid' ? 422 : 409);
  });
  return routes;
}
