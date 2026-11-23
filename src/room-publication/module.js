import { roomPublicationRoutes } from './routes.js';

export default {
  id: 'room-publication',
  requires: ['office', 'schedule'],
  staffMount: ({ db }) => ({
    path: '/schedule',
    routes: roomPublicationRoutes(db),
    dashboard: { label: 'Расписание', description: 'Публикация переноса аудитории', order: 30 },
  }),
};
