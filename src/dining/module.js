import { diningRoutes } from './routes.js';

export default {
  id: 'dining',
  demoUpgrade: true,
  studentMount: ({ db, currentSchoolDay }) => ['/dining', diningRoutes(db, currentSchoolDay)],
  navigation: group => group === 'studentServices' ? [[20, '/dining', 'Меню столовой', 'dining']] : [],
};
