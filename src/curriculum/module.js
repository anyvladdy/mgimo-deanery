import { curriculumRoutes } from './routes.js';

export default {
  id: 'curriculum',
  requires: ['plan', 'registry'],
  staffMount: ({ db }) => ({
    path: '/curriculum',
    routes: curriculumRoutes(db),
    dashboard: { label: 'Учебные планы', description: 'Черновики, публикации и архив версий', order: 70 },
  }),
  navigation: group => group === 'officeMain' ? [[40, '/office/curriculum', 'Учебные планы', 'curriculum']] : [],
};
