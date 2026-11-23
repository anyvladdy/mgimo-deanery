import * as services from './exams.js';
import { examRoutes } from './routes.js';

export default {
  id: 'exams',
  requires: ['grades', 'registry'],
  services,
  staffMount: ({ db }) => ({
    path: '/exams',
    routes: examRoutes(db),
    dashboard: { label: 'Экзамены', description: 'Время, корпус, аудитория и изменения', order: 20 },
  }),
};
