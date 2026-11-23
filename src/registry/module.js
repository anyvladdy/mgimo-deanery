import * as registry from './registry.js';
import { movementHistory } from './pages.js';
import { registryRoutes } from './routes.js';
import { applySql } from '../db/sql.js';

const syncAcademicGroups = db => applySql(db, new URL('./sync.sql', import.meta.url));

export default {
  id: 'registry',
  requires: ['office'],
  services: { ...registry, movementHistory, syncAcademicGroups },
  afterSchema: syncAcademicGroups,
  afterSeed: syncAcademicGroups,
  staffMount: ({ db }) => ({
    path: '/registry',
    routes: registryRoutes(db),
    dashboard: { label: 'Программы и группы', description: 'Новые программы, группы и зачисление', order: 60 },
  }),
};
