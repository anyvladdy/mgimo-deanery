import * as plan from './plan.js';
import * as retained from './retained.js';
import { planRoutes } from './routes.js';
import { applySql, hasTable } from '../db/sql.js';

export default {
  id: 'plan',
  services: { ...plan, ...retained, electivesRoutes: db => planRoutes(db, { electives: true }) },
  studentMount: ({ db }) => ['/plan', planRoutes(db)],
  navigation: group => group === 'studentTools' ? [[10, '/plan', 'Учебный план', 'plan', 'study']] : [],
  migrations: [db => {
    if (hasTable(db, 'curriculum_versions') && hasTable(db, 'curriculum_courses')) {
      db.exec(`
        INSERT INTO plan_published_groups (group_code, version)
        SELECT group_code, version FROM curriculum_versions WHERE state = 'published';
        INSERT INTO plan_published_courses (group_code, subject, assessment, credits)
        SELECT v.group_code, c.subject, c.assessment, c.credits
        FROM curriculum_versions v JOIN curriculum_courses c ON c.version_id = v.id
        WHERE v.state = 'published';
      `);
    }
    applySql(db, new URL('./view.sql', import.meta.url));
  }],
};
