import { Hono } from 'hono';
import { isDate, weekForStudent, weekStartOf } from './schedule.js';
import { modulesFor } from '../modules/config.js';
import { schedulePage } from './pages.js';

export function scheduleRoutes(db, currentSchoolDay) {
  const routes = new Hono();
  const modules = modulesFor(db);
  const messages = modules.get('messages');
  const canPrint = modules.has('schedule-print');

  routes.get('/', c => {
    const requested = c.req.query('date');
    const { date: today } = currentSchoolDay();
    const date = isDate(requested) ? requested : today;
    const weekStart = weekStartOf(date);
    const print = canPrint && c.req.query('view') === 'print';
    const locations = modules.get('buildings')?.campusLocations(db);
    const namedBuildings = new Map(locations?.buildings.map(({ id, name }) => [id, name]));
    const knownBuildings = new Set(locations?.byRoom.values());
    const buildings = locations?.buildings.filter(({ id }) => knownBuildings.has(id)) ?? [];
    const selected = buildings.find(({ id }) => String(id) === c.req.query('building'));
    const week = weekForStudent(db, c.get('studentId'), weekStart)
      .map(lesson => {
        const id = locations?.byRoom.get(lesson.current_room);
        return { ...lesson, buildingId: id, buildingName: namedBuildings.get(id) };
      })
      .filter(lesson => !selected || lesson.buildingId === selected.id);
    const teacherSubjects = messages && !print
      ? new Set(messages.assignedTeachers(db, c.get('studentId')).flatMap(teacher => teacher.subjects))
      : undefined;
    return c.html(schedulePage({
      date,
      today,
      weekStart,
      lessons: week.filter(lesson => lesson.lesson_date === date),
      week,
      buildings,
      selected,
      student: c.get('student'),
      csrf: c.get('csrfToken'),
      print,
      canPrint,
      hasCalendar: modules.has('calendar'),
      teacherSubjects,
    }));
  });

  return routes;
}
