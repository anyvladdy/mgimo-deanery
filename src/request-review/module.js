import { officeRequestRoutes, requestQueue } from './routes.js';

export default {
  id: 'request-review',
  requires: ['requests', 'office'],
  services: { requestQueue },
  staffMount: ({ db }) => ({ path: '/requests', routes: officeRequestRoutes(db) }),
  navigation: group => group === 'officeMain' ? [[20, '/office/requests', 'Заявки', 'office-requests']] : [],
};
