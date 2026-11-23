import { officeRoutes } from './routes.js';

export default {
  id: 'office',
  publicMount: ({ db, session, officeMounts }) => ['/office', officeRoutes(db, session, officeMounts)],
  navigation: group => group === 'officeMain' ? [[30, '/office/students', 'Студенты', 'office-students']] : [],
};
