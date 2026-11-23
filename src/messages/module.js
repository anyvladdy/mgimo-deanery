import * as services from './messages.js';
import { messageRoutes } from './routes.js';

export default {
  id: 'messages',
  requires: ['office'],
  services,
  studentMount: ({ db }) => ['/messages', messageRoutes(db)],
  staffMount: ({ db }) => ({ path: '/messages', routes: messageRoutes(db, { staffMode: true }), teachers: true, order: 20 }),
  navigation(group) {
    if (group === 'studentTools') return [[30, '/messages', 'Сообщения', 'messages']];
    if (group === 'staffTools') return [[70, '/office/messages', 'Сообщения', 'messages']];
    return [];
  },
};
