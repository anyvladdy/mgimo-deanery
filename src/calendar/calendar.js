import { isDate } from '../modules/clock.js';
import { modulesFor } from '../modules/config.js';

const dayMilliseconds = 24 * 60 * 60 * 1000;
const maxDays = 366;
const maxWeekDistance = 52 * 7;

const asDate = date => new Date(`${date}T00:00:00Z`);
const daysBetween = (from, to) => (asDate(to) - asDate(from)) / dayMilliseconds;

function shiftDate(date, days) {
  const shifted = new Date(asDate(date).getTime() + days * dayMilliseconds);
  return shifted.toISOString().split('T')[0];
}

function weekStart(date) {
  return shiftDate(date, -((asDate(date).getUTCDay() + 6) % 7));
}

export function weekRange(requested, today) {
  const current = weekStart(today);
  const selected = isDate(requested) ? weekStart(requested) : current;
  const from = Math.abs(daysBetween(current, selected)) <= maxWeekDistance ? selected : current;
  const previous = shiftDate(from, -7);
  const next = shiftDate(from, 7);
  return {
    from,
    to: shiftDate(from, 6),
    current,
    previous: daysBetween(previous, current) <= maxWeekDistance ? previous : null,
    next: daysBetween(current, next) <= maxWeekDistance ? next : null,
  };
}

function lessonEvents(schedule, db, studentId, { from, to }) {
  const firstMonday = weekStart(from);
  const weeks = Math.floor(daysBetween(firstMonday, to) / 7) + 1;
  const lessons = Array.from({ length: weeks }, (_, week) => shiftDate(firstMonday, week * 7))
    .flatMap(monday => schedule.weekForStudent(db, studentId, monday));
  return lessons.map(lesson => ({
    id: `lesson-${lesson.lesson_id}`,
    kind: 'lesson',
    title: lesson.subject,
    date: lesson.lesson_date,
    start: lesson.starts_at,
    end: lesson.ends_at,
    place: `ауд. ${lesson.current_room}`,
    href: `/schedule?date=${lesson.lesson_date}#lesson-${lesson.lesson_id}`,
    details: lesson.teacher,
  }));
}

function examEvents(grades, db, studentId, { from }) {
  return grades.upcomingSessionAssessmentsForStudent(db, studentId, from)
    .map(row => {
      const place = [row.exam_building, row.exam_room ? `ауд. ${row.exam_room}` : null].filter(Boolean).join(' · ');
      return {
        id: `exam-${row.id}`,
        kind: 'exam',
        label: row.assessment,
        title: row.subject,
        date: row.exam_date,
        ...(row.exam_time ? { start: row.exam_time } : {}),
        ...(place ? { place } : {}),
        href: grades.pendingAssessmentHref(row.id),
      };
    });
}

function sourceEvents(id, modules, db, studentId, range) {
  const source = modules.get(id);
  if (!source) return [];
  if (source.calendarEvents) return source.calendarEvents(db, studentId, range);
  if (id === 'schedule') return lessonEvents(source, db, studentId, range);
  if (id === 'grades') return examEvents(source, db, studentId, range);
  return [];
}

function withLocalHref(event) {
  if (event.href === undefined) return event;
  if (typeof event.href === 'string' && /^\/(?!\/)[^\\\u0000-\u0020\u007f]*$/u.test(event.href)) return event;
  const { href, ...details } = event;
  return details;
}

export function eventsForStudent(db, studentId, { from, to } = {}) {
  if (!isDate(from) || !isDate(to) || from > to || from < '0001-01-01' || daysBetween(from, to) >= maxDays) return [];
  const modules = modulesFor(db);
  return [...modules.entries()].flatMap(({ id }) => sourceEvents(id, modules, db, studentId, { from, to }))
    .filter(event => isDate(event.date) && event.date >= from && event.date <= to)
    .map(withLocalHref)
    .sort((left, right) => left.date.localeCompare(right.date)
      || (left.start ?? '').localeCompare(right.start ?? '')
      || left.title.localeCompare(right.title, 'ru')
      || left.id.localeCompare(right.id));
}

export function datesInRange({ from, to }) {
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, index) => shiftDate(from, index));
}

function shiftMonth(date, months) {
  const month = asDate(`${date.slice(0, 7)}-01`);
  month.setUTCMonth(month.getUTCMonth() + months);
  return month.toISOString().slice(0, 10);
}

export function monthRange(date) {
  const first = `${date.slice(0, 7)}-01`;
  const next = shiftMonth(date, 1);
  const from = weekStart(first);
  return {
    from, to: shiftDate(from, 41), first, last: shiftDate(next, -1),
    previous: shiftMonth(date, -1), next,
  };
}

const layerModules = [
  ['lesson', 'schedule'], ['exam', 'grades'], ['deadline', 'deadlines'],
  ['campus-event', 'campus-events'], ['booking', 'room-booking'], ['tuition', 'tuition'],
  ['consultation', 'consultations'],
];

export function calendarView(db, studentId, query, today) {
  const modules = modulesFor(db);
  const layers = layerModules.filter(([kind, id]) => modules.has(id)
    && (kind !== 'tuition' || modules.get(id).tuitionForStudent(db, studentId)?.funding === 'paid'))
    .map(([kind]) => kind);
  const kinds = [...new Set((query.kind ?? []).flatMap(value => value.split(',')).filter(kind => layers.includes(kind)))];
  const view = query.view?.[0] === 'month' ? 'month' : 'week';
  const requested = query.date?.[0];
  const week = weekRange(requested, today);
  const selected = isDate(requested) && requested >= week.from && requested <= week.to ? requested : today;
  const month = view === 'month' ? monthRange(selected) : null;
  if (month) {
    const earliest = shiftDate(week.current, -maxWeekDistance);
    const latest = shiftDate(week.current, maxWeekDistance + 6);
    const priorLast = shiftDate(month.first, -1);
    month.previous = priorLast < earliest ? null : month.previous < earliest ? earliest : month.previous;
    if (month.next > latest) month.next = null;
  }
  const range = month ?? week;
  const events = eventsForStudent(db, studentId, range).filter(event => !kinds.length || kinds.includes(event.kind));
  return { view, selected, today, week, month, range, events, layers, kinds };
}

export function weekLoad(events, week) {
  const dates = datesInRange(week);
  const byDate = new Map(dates.map(date => [date, 0]));
  const byKind = new Map();
  let total = 0;
  for (const { date, kind } of events) {
    if (!byDate.has(date)) continue;
    byDate.set(date, byDate.get(date) + 1);
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
    total += 1;
  }
  let busiest = null;
  for (const [date, count] of byDate) {
    if (count > (busiest?.count ?? 0)) busiest = { date, count };
  }
  return { byDate, byKind, total, busiest };
}
