import { shuttleRoutes } from './routes.js';

export default {
  id: 'shuttles',
  demoUpgrade: 2,
  studentMount: ({ db, currentSchoolDay }) => ['/shuttles', shuttleRoutes(db, currentSchoolDay)],
  navigation: group => group === 'studentServices' ? [[40, '/shuttles', 'Шаттлы', 'shuttles']] : [],
};
