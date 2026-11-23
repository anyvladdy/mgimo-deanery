import { disciplineRoutes } from './routes.js';

export default {
  id: 'disciplines',
  requires: ['plan', 'grades'],
  services: {
    disciplineHref({ subject, assessment }) {
      return `/disciplines/${encodeURIComponent(subject)}`
        + (assessment ? `?${new URLSearchParams({ assessment })}` : '');
    },
  },
  studentMount: ({ db, currentSchoolDay }) => ['/disciplines', disciplineRoutes(db, currentSchoolDay)],
};
