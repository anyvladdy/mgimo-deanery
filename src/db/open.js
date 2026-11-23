import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const academicGroups = readFileSync(new URL('./sync-academic-groups.sql', import.meta.url), 'utf8');

export function syncAcademicGroups(db) {
  db.exec(academicGroups);
}

export function openDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(schema);
    syncAcademicGroups(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function openAppDatabase(filename = process.env.DEANERY_DB ?? fileURLToPath(new URL('../../var/deanery.sqlite', import.meta.url))) {
  mkdirSync(dirname(resolve(filename)), { recursive: true });
  return openDatabase(filename);
}
