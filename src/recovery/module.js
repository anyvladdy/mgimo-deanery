import * as services from './recovery.js';
import { publicRecoveryRoutes, officeRecoveryRoutes } from './routes.js';

export default {
  id: 'recovery',
  requires: ['office'],
  services,
  publicMount: ({ db, session }) => ['/recover', publicRecoveryRoutes(db, session)],
  staffMount: ({ db }) => ({
    path: '/recovery',
    routes: officeRecoveryRoutes(db),
    dashboard: { label: 'Восстановление доступа', description: 'Запросы студентов и история решений', order: 10 },
  }),
};
