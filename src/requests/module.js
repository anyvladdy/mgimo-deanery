import { verificationRoutes } from './certificates.js';
import * as requests from './requests.js';
import { clarificationHistory } from './pages.js';
import { requestRoutes } from './routes.js';

export default {
  id: 'requests',
  core: true,
  services: { ...requests, clarificationHistory },
  migrations: [db => db.exec(`
    ALTER TABLE document_requests ADD COLUMN verification_code TEXT;
    ALTER TABLE document_requests ADD COLUMN issued_at TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS document_requests_verification
      ON document_requests(verification_code) WHERE verification_code IS NOT NULL;
  `)],
  publicMount: ({ db }) => ['/verify', verificationRoutes(db)],
  studentMount: ({ db }) => ['/requests', requestRoutes(db)],
  navigation: group => group === 'studentMain' ? [[40, '/requests', 'Заявки', 'requests']] : [],
};
