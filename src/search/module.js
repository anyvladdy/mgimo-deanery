import { searchRoutes } from './routes.js';

export default {
  id: 'search',
  studentMount: ({ db }) => ['/search', searchRoutes(db)],
  navigation: group => group === 'studentTools' ? [[35, '/search', 'Поиск', 'search']] : [],
};
