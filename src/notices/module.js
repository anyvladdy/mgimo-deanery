import * as services from './notices.js';
import { noticeRoutes } from './routes.js';
import { hasTable } from '../db/sql.js';

export default {
  id: 'notices',
  core: true,
  services,
  studentMount: ({ db, currentSchoolDay }) => ['/notices', noticeRoutes(db, currentSchoolDay)],
  navigation: group => group === 'studentTools' || group === 'studentHeader'
    ? [[20, '/notices', 'Уведомления', 'notices', 'header']] : [],
  migrations: [db => {
    if (hasTable(db, 'notice_choice_blocks')) {
      db.exec(`
        INSERT INTO notice_requirements (notice_id, module_id)
        SELECT notice_id, 'electives' FROM notice_choice_blocks WHERE true
        ON CONFLICT DO NOTHING;
      `);
    }
  }],
};
