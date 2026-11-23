import { writeTransaction } from '../db/write.js';
import { isDate } from '../modules/clock.js';
import { modulesFor } from '../modules/config.js';

export const purposeLimit = 120;
export const bookingTimes = Array.from({ length: 25 }, (_, step) =>
  `${String(8 + Math.floor(step / 2)).padStart(2, '0')}:${step % 2 === 0 ? '00' : '30'}`);

export function rooms(db) {
  return db.prepare('SELECT code, building, capacity FROM bookable_rooms ORDER BY building, code').all();
}

export function bookingUrl(room, date) {
  return `/room-booking?${new URLSearchParams({ room, date })}`;
}

function lessonOccupancy(db, room, date) {
  return modulesFor(db).get('schedule')?.roomOccupancy?.(db, room, date) ?? [];
}

function overlaps(start, end, interval) {
  return start < interval.ends_at && end > interval.starts_at;
}

function canBookAt(date, start, now) {
  return date > now.date || (date === now.date && `${start}:00` >= now.time);
}

export function isBooked(db, room, date, start, end) {
  return start < end && Boolean(db.prepare(`
    SELECT 1 FROM room_bookings
    WHERE room = ? AND booking_date = ? AND cancelled_at IS NULL
      AND starts_at < ? AND ends_at > ?
    LIMIT 1
  `).get(room, date, end, start));
}

export function roomAvailability(db, studentId, room, date, now) {
  const bookings = db.prepare(`
    SELECT starts_at, ends_at,
           CASE WHEN student_id = ? THEN id END AS id,
           CASE WHEN student_id = ? THEN purpose END AS purpose
    FROM room_bookings
    WHERE room = ? AND booking_date = ? AND cancelled_at IS NULL
  `).all(studentId, studentId, room, date);
  const lessons = lessonOccupancy(db, room, date).map(lesson => ({ ...lesson, lesson: true }));
  const occupied = [...bookings, ...lessons]
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));

  const free = [];
  for (const [index, start] of bookingTimes.slice(0, -1).entries()) {
    const end = bookingTimes[index + 1];
    if (!canBookAt(date, start, now) || occupied.some(interval => overlaps(start, end, interval))) continue;
    const last = free.at(-1);
    if (last?.ends_at === start) last.ends_at = end;
    else free.push({ starts_at: start, ends_at: end });
  }
  return { occupied, free };
}

export function createBooking(db, studentId, { room, date, start, end, purpose }, now) {
  const first = bookingTimes.indexOf(start);
  const last = bookingTimes.indexOf(end);
  const reason = typeof purpose === 'string' ? purpose.trim() : '';
  if (!isDate(date)) return { error: 'Выберите корректную дату.' };
  if (typeof room !== 'string' || !db.prepare('SELECT 1 FROM bookable_rooms WHERE code = ?').get(room)) {
    return { error: 'Выберите аудиторию из списка.' };
  }
  if (first < 0 || last <= first || last - first > 4) {
    return { error: 'Выберите интервал с 08:00 до 20:00, от 30 минут до 2 часов.' };
  }
  if (!reason || reason.length > purposeLimit || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(reason)) {
    return { error: `Укажите цель брони, до ${purposeLimit} знаков в одну строку.` };
  }
  return writeTransaction(db, () => {
    const existing = db.prepare(`
      SELECT id FROM room_bookings
      WHERE student_id = ? AND room = ? AND booking_date = ? AND starts_at = ? AND ends_at = ?
        AND purpose = ? AND cancelled_at IS NULL
    `).get(studentId, room, date, start, end, reason);
    if (existing) return { id: existing.id };
    if (!canBookAt(date, start, now)) return { error: 'Это время уже прошло. Выберите следующий свободный интервал.' };
    if (isBooked(db, room, date, start, end)
      || lessonOccupancy(db, room, date).some(interval => overlaps(start, end, interval))) {
      return { conflict: true, error: 'В это время аудитория занята. Выберите свободный интервал.' };
    }
    const result = db.prepare(`
      INSERT INTO room_bookings (room, student_id, booking_date, starts_at, ends_at, purpose)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(room, studentId, date, start, end, reason);
    return { id: result.lastInsertRowid };
  });
}

export function bookingForStudent(db, studentId, id) {
  return db.prepare(`
    SELECT id, room, booking_date, cancelled_at FROM room_bookings
    WHERE student_id = ? AND id = ?
  `).get(studentId, id);
}

export function cancelBooking(db, studentId, id) {
  return writeTransaction(db, () => {
    const booking = bookingForStudent(db, studentId, id);
    if (!booking || booking.cancelled_at) return booking;

    db.prepare(`
      UPDATE room_bookings SET cancelled_at = deanery_timestamp()
      WHERE student_id = ? AND id = ?
    `).run(studentId, id);
    return booking;
  });
}

export function calendarEvents(db, studentId, { from, to }) {
  return db.prepare(`
    SELECT b.id, b.room, b.booking_date, b.starts_at, b.ends_at, b.purpose, r.building
    FROM room_bookings b JOIN bookable_rooms r ON r.code = b.room
    WHERE b.student_id = ? AND b.cancelled_at IS NULL AND b.booking_date BETWEEN ? AND ?
    ORDER BY b.booking_date, b.starts_at, b.id
  `).all(studentId, from, to).map(booking => ({
    id: `booking:${booking.id}`,
    kind: 'booking',
    title: `Бронь аудитории ${booking.room}`,
    date: booking.booking_date,
    start: booking.starts_at,
    end: booking.ends_at,
    place: `${booking.building} · ауд. ${booking.room}`,
    href: `${bookingUrl(booking.room, booking.booking_date)}#booking-${booking.id}`,
    details: booking.purpose,
  }));
}
