import { modulesFor } from '../modules/config.js';
import { formatDate } from '../ui/format.js';

const actions = [
  ['requests', 'Заказать справку об обучении', '/requests', 'Подать заявку на справку'],
  ['electives', 'Выбрать курс', '/plan#electives', 'Запись на дисциплину по выбору'],
  ['room-booking', 'Забронировать аудиторию', '/room-booking', 'Резерв учебного помещения'],
  ['messages', 'Написать в учебный офис', '/messages/new', 'Новое сообщение деканату'],
  ['calendar-export', 'Скачать календарь', '/calendar/export.ics', 'Выгрузка недели в формате .ics'],
];

const normalize = text => String(text ?? '').toLocaleLowerCase('ru').replaceAll('ё', 'е');

function rank(query, row) {
  const values = [row.title, ...row.matches].map(normalize);
  if (values.some(value => value === query)) return 0;
  if (values.some(value => value.startsWith(query))) return 1;
  return values.some(value => value.includes(query)) ? 2 : 3;
}

export function actionsFor(modules) {
  return actions.filter(([id]) => modules.has(id)).map(([, title, href, description]) => ({
    title, href, description, matches: [description, ...(href === '/requests' ? ['справка'] : [])],
  }));
}

function searchGroups(db, studentId, modules) {
  const plan = modules.get('plan')?.planForStudent(db, studentId);
  const disciplineHref = modules.get('disciplines')?.disciplineHref;
  const syllabusBySubject = new Map(modules.get('syllabus')?.listSyllabuses(db).map(row => [row.subject, row.id]));
  const courses = [...(plan?.courses ?? []), ...(plan?.postponed ?? [])];
  const ownSubjects = new Set(courses.map(course => course.subject));
  const assigned = modules.get('messages')?.assignedTeachers(db, studentId).flatMap(teacher =>
    teacher.subjects.map(subject => ({ subject, teacher: teacher.name, assigned: true }))) ?? [];
  const scheduled = modules.get('schedule')?.teachersForStudent(db, studentId) ?? [];
  return [
    ['Дисциплины', courses.map(course => ({
      title: course.subject, description: `${course.assessment} · ${course.credits} з. е.`,
      href: disciplineHref?.(course) ?? (course.syllabus ? `/syllabuses/${course.syllabus}` : '/plan#subjects'),
      matches: [course.assessment],
    }))],
    ['Преподаватели', [...assigned, ...scheduled].map(({ subject, teacher, assigned: canMessage }) => ({
      title: teacher, description: subject, matches: [subject],
      href: disciplineHref && ownSubjects.has(subject) ? disciplineHref({ subject })
        : canMessage && syllabusBySubject.has(subject) ? `/messages/new?syllabus=${syllabusBySubject.get(subject)}`
          : canMessage ? '/messages/new' : '/schedule',
    }))],
    ['Аудитории', modules.get('buildings')?.roomsWithBuildings(db).map(row => ({
      title: `Аудитория ${row.room}`, description: `${row.name} · ${row.address}`, matches: [row.room, row.name, row.address],
      href: `/buildings#building-${row.building_id}`,
    }))],
    ['Заявки', modules.get('requests')?.listRequests(db, studentId).map(row => ({
      title: `№ ${row.id} · ${row.kind}`, description: row.status, href: `/requests/${row.id}`,
      matches: [row.id, row.kind, row.status],
    }))],
    ['Дедлайны', modules.get('deadlines')?.deadlinesForStudent(db, studentId).map(row => ({
      title: row.title, description: formatDate(row.due_date), matches: [row.due_date],
      href: `/deadlines#deadline-${row.id}`,
    }))],
    ['Сообщения', modules.get('messages')?.listThreads(db, { role: 'student', id: studentId }).map(row => ({
      title: row.subject, description: row.closed_at ? 'Закрыто' : row.last_from_staff ? 'Получен ответ' : 'Ждёт ответа',
      matches: [], href: `/messages/${row.id}`,
    }))],
    ['Объявления', modules.get('notices')?.groupNotices(db, studentId).map(row => ({
      title: row.title, description: formatDate(row.date), matches: [row.category, row.date],
      href: `/notices#notice-group-${row.id}`,
    }))],
    ['Действия', actionsFor(modules)],
  ];
}

export function searchForStudent(db, studentId, query) {
  const normalized = normalize(query);
  const groups = searchGroups(db, studentId, modulesFor(db));
  // One URL can appear in more than one source. Keep its strongest match.
  const candidates = groups.flatMap(([label, items]) => (items ?? []).map(item => ({ ...item, label, rank: rank(normalized, item) })))
    .filter(item => item.rank < 3)
    .sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title, 'ru'));
  const used = new Set();
  const selected = new Map();
  for (const item of candidates) {
    const group = selected.get(item.label) ?? [];
    if (used.has(item.href) || group.length >= 5) continue;
    used.add(item.href);
    selected.set(item.label, [...group, item]);
    if (used.size === 30) break;
  }
  return { total: used.size, groups: groups.flatMap(([label]) => selected.has(label) ? [[label, selected.get(label)]] : []) };
}
