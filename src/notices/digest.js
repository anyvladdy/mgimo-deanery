import { isDate, parseTimestamp, schoolDayAt } from '../modules/clock.js';
import { modulesFor } from '../modules/config.js';
import { formatDate } from '../ui/format.js';
import { noticesForStudent } from './notices.js';

export function digestPeriod(value) {
  return value === 'today' || value === 'week' ? value : 'all';
}

export function digestHref({ unread, period }) {
  const params = new URLSearchParams();
  if (unread) params.set('view', 'unread');
  if (period !== 'all') params.set('period', period);
  return params.size ? `/notices?${params}` : '/notices';
}

const dayMs = 86_400_000;
const timestamp = (date, time = '00:00') => Date.parse(`${date}T${time.slice(0, 5)}:00+03:00`);
const order = ['Требует действия', 'Изменения', 'Результаты', 'Объявления'];

function eventDate(event) {
  if (isDate(event.date)) return event.date;
  const value = parseTimestamp(event.date);
  return Number.isNaN(value.getTime()) ? null : schoolDayAt(value).date;
}

function groupFor(event) {
  if (event.actionOnly || event.kind === 'message' || event.kind === 'clarification') return order[0];
  if (event.kind === 'room' || event.category === 'Изменение экзамена') return order[1];
  if (event.kind === 'grade' || event.kind === 'request') return order[2];
  return order[3];
}

function actionEvents(db, studentId, today) {
  const modules = modulesFor(db);
  const deadlines = modules.get('deadlines')?.deadlinesForStudent(db, studentId) ?? [];
  const grades = modules.get('grades');
  const debts = grades?.gradeOverview(grades.gradeRowsForOverview(db, studentId), 'debts').rows ?? [];
  return [
    ...deadlines.filter(row => !row.completed_at && row.due_date >= today).map(row => ({
      id: row.id, kind: 'deadline', title: row.title, category: 'Дедлайн', date: row.due_date,
      message: formatDate(row.due_date) + (row.due_time ? ` · ${row.due_time} МСК` : ''),
      href: `/deadlines#deadline-${row.id}`, actionOnly: true,
    })),
    ...debts.map(row => ({
      id: row.id, kind: 'debt', title: row.subject, category: 'Задолженность', date: today,
      href: `/grades?view=debts#grade-${row.id}`, actionOnly: true,
    })),
  ];
}

function isCritical(event, now, date) {
  if (event.kind === 'debt') return true;
  if (!date) return false;
  if (event.kind === 'deadline') return timestamp(date) - timestamp(now.date) <= dayMs;
  if (event.kind !== 'room' && event.category !== 'Изменение экзамена') return false;
  const start = timestamp(date, event.startsAt || '23:59');
  const difference = start - timestamp(now.date, now.time);
  return difference >= 0 && difference <= 2 * dayMs;
}

export function noticeDigest(db, studentId, now, { period, unread }) {
  const events = noticesForStudent(db, studentId, now.date);
  const visible = unread ? events.filter(event => !event.read) : [...events, ...actionEvents(db, studentId, now.date)];
  const grouped = Map.groupBy(visible.flatMap(event => {
    const date = eventDate(event);
    const offset = (timestamp(date) - timestamp(now.date)) / dayMs;
    if (period === 'today' && date !== now.date) return [];
    if (period === 'week' && !(offset >= 0 && offset < 7)) return [];
    return [{ ...event, critical: isCritical(event, now, date) }];
  }), groupFor);
  return order.flatMap(label => grouped.has(label) ? [[label, grouped.get(label)]] : []);
}
