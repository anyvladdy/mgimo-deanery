import { modulesFor } from '../modules/config.js';
import { applySql } from '../db/sql.js';

export default {
  id: 'electives',
  requires: ['plan'],
  studentMount: ({ db }) => ['/electives', modulesFor(db).get('plan').electivesRoutes(db)],
  navigation: group => group === 'studentFullTools'
    ? [[20, '/electives', 'Дисциплины по выбору', 'electives', 'study']] : [],
  afterSchema(db, modules) {
    if (modules.has('notices')) applySql(db, new URL('./notice-schema.sql', import.meta.url));
    modules.get('plan').reconcileElectives?.(db);
  },
  afterSeed(db, modules) {
    if (modules.has('notices')) applySql(db, new URL('./notice-seed.sql', import.meta.url));
  },
};
