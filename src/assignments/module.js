import { applySql } from '../db/sql.js';
import { studentRoutes, staffRoutes } from './routes.js';

export default {
  id: 'assignments',
  requires: ['gradebook'],
  demoUpgrade: true,
  services: { seedDemoAssignments: db => applySql(db, new URL('./seed.sql', import.meta.url)) },
  studentMount: ({ db, currentSchoolDay }) => ['/assignments', studentRoutes(db, currentSchoolDay)],
  staffMount: ({ db, currentSchoolDay }) => ({
    path: '/assignments', routes: staffRoutes(db, currentSchoolDay), teachers: true, order: 12,
  }),
  navigation(group) {
    if (group === 'studentTools') return [[17, '/assignments', 'Задания', 'assignments', 'study']];
    if (group === 'staffTools') return [[62, '/office/assignments', 'Задания и работы', 'assignments']];
    return [];
  },
};
