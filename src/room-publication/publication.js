import { writeTransaction } from '../db/write.js';

export const maxRoomLength = 60;

const officeSchedule = `
  SELECT l.id, l.subject, l.teacher, l.group_code, l.lesson_date, l.starts_at, l.ends_at,
         l.scheduled_room, c.new_room
  FROM lessons l LEFT JOIN room_changes c ON c.lesson_id = l.id
`;

export function lessonsOnDate(db, date) {
  return db.prepare(`
    ${officeSchedule}
    WHERE l.lesson_date = ?
    ORDER BY l.starts_at, l.group_code, l.id
  `).all(date);
}

export function lessonForPublication(db, id) {
  return db.prepare(`${officeSchedule} WHERE l.id = ?`).get(id);
}

export function normalizeRoom(value) {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)) return '';
  const room = value.normalize('NFC').replace(/\p{Zs}+/gu, ' ').trim();
  return room.length <= maxRoomLength ? room : '';
}

export function publishRoom(db, lessonId, staffId, room) {
  return writeTransaction(db, () => {
    const lesson = lessonForPublication(db, lessonId);
    if (!lesson) return { outcome: 'missing' };
    if (!room) return { outcome: 'invalid', lesson };
    if (lesson.new_room !== null) {
      return { outcome: normalizeRoom(lesson.new_room) === room ? 'published' : 'conflict', lesson };
    }
    if (normalizeRoom(lesson.scheduled_room) === room) return { outcome: 'unchanged', lesson };

    const inserted = db.prepare('INSERT INTO room_changes (lesson_id, new_room) VALUES (?, ?)')
      .run(lessonId, room);
    db.prepare('INSERT INTO room_change_publications (change_id, staff_id, published_at) VALUES (?, ?, ?)')
      .run(inserted.lastInsertRowid, staffId, new Date().toISOString());
    return { outcome: 'published' };
  });
}
