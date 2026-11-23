import { staffRoutes, studentRoutes } from './routes.js';
import { setRecipient } from './appeals.js';

export default {
  id: 'urgent-appeals',
  requires: ['office', 'registry', 'requests'],
  services: { setRecipient },
  studentMount: ({ db }) => ['/urgent-appeals', studentRoutes(db)],
  staffMount: ({ db }) => ({
    path: '/urgent-appeals', routes: staffRoutes(db), leadership: true,
    dashboard: { label: 'Срочные обращения', description: 'Очередь для назначенных получателей', order: 30 },
  }),
  navigation(group) {
    if (group === 'studentTools') return [[28, '/urgent-appeals', 'Срочное обращение', 'urgent-appeals']];
    if (group === 'officeMain' || group === 'leadershipTools') return [[32, '/office/urgent-appeals', 'Срочные обращения', 'urgent-appeals']];
    return [];
  },
};
