import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { bindModules, modulesFor } from '../modules/config.js';
import { schoolNow } from '../modules/clock.js';
import { resolveModules } from '../modules/catalog.js';
import { applySql } from './sql.js';
import { writeTransaction } from './write.js';

const accountSchema = new URL('../account/schema.sql', import.meta.url);

export function syncAcademicGroups(db) {
  modulesFor(db).get('registry')?.syncAcademicGroups(db);
}

export function openDatabase(filename = ':memory:', { modules = resolveModules() } = {}) {
  const db = new DatabaseSync(filename);
  try {
    bindModules(db, modules);
    db.function('deanery_timestamp', () => schoolNow().toISOString().slice(0, 23).replace('T', ' '));
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    writeTransaction(db, () => {
      applySql(db, accountSchema);
      for (const module of modules.entries()) {
        applySql(db, new URL('./schema.sql', module.manifest), { optional: true });
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          module_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          PRIMARY KEY (module_id, version)
        );
      `);
      const revision = db.prepare('SELECT 1 FROM schema_migrations WHERE module_id = ? AND version = ?');
      const record = db.prepare('INSERT INTO schema_migrations VALUES (?, ?)');
      for (const module of modules.entries()) {
        for (const [index, migrate] of (module.migrations ?? []).entries()) {
          const version = index + 1;
          if (revision.get(module.id, version)) continue;
          migrate(db);
          record.run(module.id, version);
        }
        module.afterSchema?.(db, modules);
      }
    });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function openAppDatabase(
  filename = process.env.DEANERY_DB ?? fileURLToPath(new URL('../../var/deanery.sqlite', import.meta.url)),
  { modules = resolveModules(process.env.DEANERY_MODULES ?? 'full') } = {},
) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  return openDatabase(filename, { modules });
}
