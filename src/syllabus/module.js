import * as services from './syllabuses.js';
import { officeSyllabusRoutes, syllabusRoutes } from './routes.js';

export default {
  id: 'syllabus',
  services,
  studentMount: ({ db }) => ['/syllabuses', syllabusRoutes(db)],
  staffMount: ({ db }) => ({
    path: '/syllabuses',
    routes: officeSyllabusRoutes(db),
    maxBodyBytes: 40 * 1024,
    dashboard: { label: 'Силлабусы', description: 'Описание дисциплин и условия оценки', order: 50 },
  }),
  navigation(group, enabled) {
    if (group === 'studentTools' && !enabled.has('plan')) return [[10, '/syllabuses', 'Силлабусы', 'syllabus']];
    if (group === 'officeMain') return [[50, '/office/syllabuses', 'Силлабусы', 'office-syllabuses']];
    return [];
  },
};
