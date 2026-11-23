import * as services from './schedule.js';
import { scheduleRoutes } from './routes.js';

export default {
  id: 'schedule',
  core: true,
  services,
  studentMount: ({ db, currentSchoolDay }) => ['/schedule', scheduleRoutes(db, currentSchoolDay)],
  navigation: group => group === 'studentMain' ? [[20, '/schedule', 'Пары', 'schedule', 'week']] : [],
};
