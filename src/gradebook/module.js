import * as services from './gradebook.js';
import { gradebookRoutes } from './routes.js';

export default {
  id: 'gradebook',
  requires: ['office', 'grades', 'plan'],
  services,
  staffMount: ({ db }) => ({ path: '/gradebook', routes: gradebookRoutes(db), teachers: true, order: 10 }),
  navigation: group => group === 'staffTools' ? [[60, '/office/gradebook', 'Ведомости', 'gradebook']] : [],
};
