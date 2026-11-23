import { applySql } from '../db/sql.js';
import { calendarEvents, calendarEventsForStaff, consultationForContact } from './consultations.js';
import { studentRoutes, staffRoutes } from './routes.js';

export default {
  id: 'consultations',
  requires: ['office', 'registry'],
  demoUpgrade: true,
  services: {
    calendarEvents,
    calendarEventsForStaff,
    consultationForContact,
    seedDemoConsultations: db => applySql(db, new URL('./seed.sql', import.meta.url)),
  },
  studentMount: ({ db, currentSchoolDay }) => ['/consultations', studentRoutes(db, currentSchoolDay)],
  staffMount: ({ db, currentSchoolDay }) => ({
    path: '/consultations', routes: staffRoutes(db, currentSchoolDay), teachers: true, order: 65,
    dashboard: { label: 'Консультации', description: 'Встречи преподавателей со студентами и запись', order: 65 },
  }),
  navigation(group) {
    if (group === 'studentTools') return [[25, '/consultations', 'Консультации', 'consultations']];
    if (group === 'staffTools') return [[65, '/office/consultations', 'Консультации', 'consultations']];
    return [];
  },
};
