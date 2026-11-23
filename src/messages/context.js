import { modulesFor } from '../modules/config.js';
import { subjectLimit } from './messages.js';

export function contactContext(db, studentId, teachers, query) {
  const origins = ['lesson', 'syllabus', 'request', 'consultation'].filter(kind => query[kind] !== undefined);
  if (!origins.length) return { teachers, recipient: 'office', subject: '' };
  if (origins.length > 1) return null;
  const [kind] = origins;
  const value = query[kind];
  const id = /^[1-9]\d*$/.test(value) ? Number(value) : 0;
  if (!id || !Number.isSafeInteger(id)) return null;

  const modules = modulesFor(db);
  if (kind === 'request') {
    const request = modules.get('requests')?.requestForStudent(db, studentId, id);
    return request ? { teachers, recipient: 'office', subject: `Заявка № ${id} · ${request.subject ?? request.kind}`.slice(0, subjectLimit) } : null;
  }

  if (kind === 'consultation') {
    const slot = modules.get('consultations')?.consultationForContact(db, studentId, id);
    const teacher = slot && teachers.find(row => row.id === slot.staff_id && row.subjects.includes(slot.subject));
    return teacher ? { teachers: [teacher], recipient: `teacher-${teacher.id}`,
      subject: `Консультация: ${slot.subject} · ${slot.booked_topic}`.slice(0, subjectLimit) } : null;
  }

  const course = kind === 'lesson'
    ? modules.get('schedule')?.lessonForStudent(db, studentId, id)
    : modules.get('syllabus')?.syllabusForId(db, id);
  if (!course) return null;
  const recipients = teachers.filter(teacher => teacher.subjects.includes(course.subject));
  if (!recipients.length) return null;
  return {
    teachers: recipients,
    subject: course.subject.slice(0, subjectLimit),
    recipient: recipients.length === 1 ? `teacher-${recipients[0].id}` : '',
  };
}
