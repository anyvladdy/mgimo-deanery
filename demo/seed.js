import { applySql } from '../src/db/sql.js';
import { writeTransaction } from '../src/db/write.js';
import { modulesFor } from '../src/modules/config.js';

function demoRevisions(db) {
  db.exec('CREATE TABLE IF NOT EXISTS demo_seeded_modules (module_id TEXT PRIMARY KEY)');
  return db.prepare('INSERT INTO demo_seeded_modules VALUES (?) ON CONFLICT DO NOTHING');
}

function seedRevision({ id, demoUpgrade }) {
  return demoUpgrade === true ? id : `${id}:${demoUpgrade}`;
}

export function seedDemoData(db) {
  const modules = modulesFor(db);
  const upgrades = [...modules.entries()].filter(module => module.demoUpgrade);
  applySql(db, new URL('../src/account/seed.sql', import.meta.url));
  for (const module of modules.entries()) {
    applySql(db, new URL('./seed.sql', module.manifest), { optional: true });
  }
  for (const module of modules.entries()) module.afterSeed?.(db, modules);
  if (upgrades.length) {
    const record = demoRevisions(db);
    for (const module of upgrades) record.run(seedRevision(module));
  }
}

export function seedNewDemoModules(db) {
  const upgrades = [...modulesFor(db).entries()].filter(module => module.demoUpgrade);
  if (!upgrades.length) return;
  writeTransaction(db, () => {
    const record = demoRevisions(db);
    for (const module of upgrades) {
      if (record.run(seedRevision(module)).changes) applySql(db, new URL('./seed.sql', module.manifest));
    }
  });
}
