import { existsSync, readFileSync } from 'node:fs';

export function applySql(db, url, { optional = false } = {}) {
  if (!optional || existsSync(url)) db.exec(readFileSync(url, 'utf8'));
}

export function hasTable(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name));
}
