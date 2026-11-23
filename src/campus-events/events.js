import { writeTransaction } from '../db/write.js';

const visibleEvents = `
  SELECT e.*, (r.student_id IS NOT NULL) AS registered
  FROM campus_events e
  JOIN students s ON s.id = ?
  LEFT JOIN campus_event_registrations r ON r.event_id = e.id AND r.student_id = s.id
  WHERE e.published_at IS NOT NULL AND (e.program IS NULL OR e.program = s.program)
`;

export function eventsForStudent(db, studentId) {
  return db.prepare(`${visibleEvents} ORDER BY e.event_date, e.starts_at, e.id`).all(studentId);
}

export function eventForStudent(db, studentId, eventId) {
  return db.prepare(`${visibleEvents} AND e.id = ?`).get(studentId, eventId);
}

export function registrationOpen(event, schoolDay) {
  return event.event_date > schoolDay.date
    || (event.event_date === schoolDay.date && `${event.starts_at}:00` > schoolDay.time);
}

export function changeRegistration(db, studentId, eventId, schoolDay, register) {
  return writeTransaction(db, () => {
    const event = eventForStudent(db, studentId, eventId);
    if (!event) return { status: 'missing' };
    if (!registrationOpen(event, schoolDay)) return { status: 'closed', event };
    if (register) {
      const inserted = db.prepare(`
        INSERT INTO campus_event_registrations (event_id, student_id, registered_at)
        VALUES (?, ?, deanery_timestamp())
        ON CONFLICT (event_id, student_id) DO NOTHING
      `).run(eventId, studentId);
      return { status: 'ok', changed: Boolean(inserted.changes) };
    }
    const removed = db.prepare('DELETE FROM campus_event_registrations WHERE event_id = ? AND student_id = ?')
      .run(eventId, studentId);
    return { status: 'ok', changed: Boolean(removed.changes) };
  });
}

export function calendarEvents(db, studentId, { from, to }) {
  return db.prepare(`${visibleEvents} AND e.event_date BETWEEN ? AND ?`).all(studentId, from, to).map(event => ({
    id: `campus-event-${event.id}`,
    kind: 'campus-event',
    title: event.title,
    date: event.event_date,
    start: event.starts_at,
    ...(event.ends_at ? { end: event.ends_at } : {}),
    place: event.place,
    href: `/events/${event.id}`,
    details: event.description,
  }));
}
