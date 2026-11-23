import * as services from './grades.js';
import { gradesRoutes } from './routes.js';
import { applySql } from '../db/sql.js';

export default {
  id: 'grades',
  core: true,
  services,
  studentMount: ({ db, currentSchoolDay }) => ['/grades', gradesRoutes(db, currentSchoolDay)],
  navigation: group => group === 'studentMain' ? [[30, '/grades', 'Ведомость', 'grades', 'study']] : [],
  afterSeed(db, modules) {
    if (modules.has('plan')) applySql(db, new URL('./plan-seed.sql', import.meta.url));
  },
};
