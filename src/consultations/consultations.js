import { hasTable } from '../db/sql.js';
import { writeTransaction } from '../db/write.js';
import { modulesFor } from '../modules/config.js';

const slotFields = `SELECT c.*, a.full_name AS teacher,
  (SELECT COUNT(*) FROM consultation_bookings b WHERE b.slot_id = c.id AND b.cancelled_at IS NULL) AS taken
  FROM consultation_slots c JOIN staff_accounts a ON a.id = c.staff_id`;
const ownedBooking = `SELECT c.*, b.topic AS booked_topic
  FROM consultation_bookings b JOIN consultation_slots c ON c.id = b.slot_id
  WHERE b.student_id = ? AND b.cancelled_at IS NULL AND c.cancelled_at IS NULL`;

export function upcoming(slot, now) {
  return slot.slot_date > now.date || (slot.slot_date === now.date && `${slot.starts_at}:00` > now.time);
}

function canSee(slot, student, subjects) {
  return slot.booked_topic != null || (slot.group_code ? slot.group_code === student.group_code : subjects.has(slot.subject));
}

function subjectsForStudent(db, studentId) {
  const courses = modulesFor(db).get('plan')?.planForStudent(db, studentId).courses ?? [];
  return new Set(courses.map(course => course.subject));
}

export function studentSlots(db, student, now) {
  const subjects = subjectsForStudent(db, student.id);
  return db.prepare(`
    SELECT slots.*, b.topic AS booked_topic FROM (${slotFields} WHERE c.cancelled_at IS NULL AND c.slot_date >= ?) slots
    LEFT JOIN consultation_bookings b ON b.slot_id = slots.id AND b.student_id = ? AND b.cancelled_at IS NULL
    ORDER BY slot_date, starts_at, slots.id
  `).all(now.date, student.id).filter(slot => upcoming(slot, now) && canSee(slot, student, subjects));
}

export function changeBooking(db, student, id, now, book, topic) {
  const subjects = subjectsForStudent(db, student.id);
  return writeTransaction(db, () => {
    const slot = db.prepare(`
      SELECT slots.*, b.topic AS booked_topic FROM (${slotFields} WHERE c.id = ? AND c.cancelled_at IS NULL) slots
      LEFT JOIN consultation_bookings b ON b.slot_id = slots.id AND b.student_id = ? AND b.cancelled_at IS NULL
    `).get(id, student.id);
    if (!slot || !canSee(slot, student, subjects)) return 'missing';
    if (!upcoming(slot, now)) return 'started';
    if (!book) {
      db.prepare(`
        UPDATE consultation_bookings SET cancelled_at = deanery_timestamp()
        WHERE slot_id = ? AND student_id = ? AND cancelled_at IS NULL
      `).run(id, student.id);
      return 'ok';
    }
    if (slot.booked_topic != null) return 'ok';
    if (slot.taken >= slot.capacity) return 'full';
    db.prepare(`
      INSERT INTO consultation_bookings (slot_id, student_id, topic, created_at)
      VALUES (?, ?, ?, deanery_timestamp())
      ON CONFLICT(slot_id, student_id) DO UPDATE SET topic = excluded.topic, created_at = excluded.created_at, cancelled_at = NULL
    `).run(id, student.id, topic);
    return 'ok';
  });
}

function calendarEvent(slot, href) {
  return {
    id: `consultation-${slot.id}`, kind: 'consultation', date: slot.slot_date, title: slot.subject,
    start: slot.starts_at, end: slot.ends_at, place: slot.mode === 'online' ? 'Онлайн' : `ауд. ${slot.room}`, href,
  };
}

export function calendarEvents(db, studentId, { from, to }) {
  return db.prepare(`${ownedBooking} AND c.slot_date BETWEEN ? AND ?`).all(studentId, from, to)
    .map(slot => calendarEvent(slot, `/consultations#consultation-${slot.id}`));
}

export function calendarEventsForStaff(db, staffId, { from, to }) {
  return db.prepare(`${slotFields}
    WHERE c.staff_id = ? AND c.slot_date BETWEEN ? AND ? AND c.cancelled_at IS NULL
      AND EXISTS (SELECT 1 FROM consultation_bookings b WHERE b.slot_id = c.id AND b.cancelled_at IS NULL)
    ORDER BY c.slot_date, c.starts_at, c.id
  `).all(staffId, from, to).map(slot => calendarEvent(slot, `/office/consultations#office-consultation-${slot.id}`));
}

export function consultationForContact(db, studentId, id) {
  return db.prepare(`${ownedBooking} AND c.id = ?`).get(studentId, id);
}

export function assignedCourses(db, staffId) {
  if (!hasTable(db, 'teaching_assignments')) return [];
  return db.prepare(`
    SELECT DISTINCT group_code, subject FROM teaching_assignments WHERE staff_id = ? ORDER BY group_code, subject
  `).all(staffId);
}

export function staffSlots(db, staff) {
  return db.prepare(`${slotFields} WHERE (? <> 'teacher' OR c.staff_id = ?) ORDER BY slot_date DESC, starts_at, c.id`)
    .all(staff.role, staff.id);
}

export function teachersForOffice(db) {
  return db.prepare("SELECT id, full_name FROM staff_accounts WHERE role = 'teacher' AND active = 1 ORDER BY full_name").all();
}

export function createSlot(db, staff, draft) {
  return writeTransaction(db, () => {
    if (staff.role === 'teacher' && !assignedCourses(db, staff.id).some(row =>
      row.subject === draft.subject && row.group_code === draft.group_code)) return 'forbidden';
    const teacher = db.prepare("SELECT 1 FROM staff_accounts WHERE id = ? AND role = 'teacher' AND active = 1").get(draft.staff_id);
    if (!teacher) return 'teacher';
    if (draft.group_code && !modulesFor(db).get('registry').academicGroup(db, draft.group_code)) return 'group';
    const existing = db.prepare(`
      SELECT id FROM consultation_slots WHERE staff_id = ? AND subject = ? AND group_code IS ?
      AND slot_date = ? AND starts_at = ? AND ends_at = ? AND mode = ? AND room IS ?
      AND capacity = ? AND note IS ? AND cancelled_at IS NULL
    `).get(draft.staff_id, draft.subject, draft.group_code, draft.slot_date, draft.starts_at, draft.ends_at,
      draft.mode, draft.room, draft.capacity, draft.note);
    if (existing) return existing.id;
    return db.prepare(`
      INSERT INTO consultation_slots (staff_id, subject, group_code, slot_date, starts_at, ends_at, room,
        mode, capacity, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, deanery_timestamp()) RETURNING id
    `).get(draft.staff_id, draft.subject, draft.group_code, draft.slot_date, draft.starts_at, draft.ends_at,
      draft.room, draft.mode, draft.capacity, draft.note).id;
  });
}

export function cancelSlot(db, staff, id, now) {
  const result = db.prepare(`
    UPDATE consultation_slots SET cancelled_at = COALESCE(cancelled_at, deanery_timestamp())
    WHERE id = ? AND (? <> 'teacher' OR staff_id = ?)
      AND (cancelled_at IS NOT NULL OR slot_date > ? OR (slot_date = ? AND starts_at > ?))
  `).run(id, staff.role, staff.id, now.date, now.date, now.time.slice(0, 5));
  return result.changes > 0;
}
