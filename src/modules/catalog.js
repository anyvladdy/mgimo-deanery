import { existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const source = new URL('../', import.meta.url);
const catalog = new Map();

for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifest = new URL(`${entry.name}/module.js`, source);
  if (!existsSync(manifest)) continue;
  const { default: definition } = await import(manifest.href);
  if (definition.id !== entry.name || !/^[a-z][a-z\d-]*$/.test(definition.id)) {
    throw new Error(`Некорректный идентификатор модуля в ${entry.name}/module.js.`);
  }
  catalog.set(definition.id, Object.freeze({ ...definition, manifest }));
}

export function resolveModules(selection = 'full') {
  const [profile, ...changes] = selection.trim().split(',').map(part => part.trim());
  if (!['full', 'core'].includes(profile)) {
    throw new Error('DEANERY_MODULES: начните с full или core.');
  }

  const requested = new Set([...catalog.values()]
    .filter(module => profile === 'full' || module.core).map(module => module.id));
  const blocked = new Set();
  for (const change of changes) {
    const id = change.slice(1);
    if (!/^[+-][a-z][a-z\d-]*$/.test(change)) {
      throw new Error(`DEANERY_MODULES: некорректная запись «${change}».`);
    }
    if (change[0] === '+') {
      requested.add(id);
      blocked.delete(id);
    } else {
      requested.delete(id);
      blocked.add(id);
    }
  }

  const enabled = new Map();
  const visiting = new Set();
  const unavailable = new Set();
  function load(id) {
    if (enabled.has(id)) return true;
    if (blocked.has(id) || unavailable.has(id) || !catalog.has(id)) return false;
    if (visiting.has(id)) throw new Error(`Циклическая зависимость модуля «${id}».`);
    visiting.add(id);
    const definition = catalog.get(id);
    const available = (definition.requires ?? []).every(load);
    visiting.delete(id);
    if (available) enabled.set(id, definition);
    else unavailable.add(id);
    return available;
  }
  // Resolve separately so a suspended module cannot leave its unused prerequisites active.
  const eligible = [...requested].filter(load);
  enabled.clear();
  eligible.forEach(load);

  const ids = Object.freeze([...enabled.keys()].sort());
  const access = Object.freeze({ has: id => enabled.has(id), get: id => enabled.get(id)?.services });
  return Object.freeze({
    ...access,
    ids,
    suspended: Object.freeze([...requested].filter(id => !enabled.has(id)).sort()),
    key: createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 12),
    entries: () => enabled.values(),
    navigation: group => [...enabled.values()]
      .flatMap(module => module.navigation?.(group, access) ?? [])
      .sort((left, right) => left[0] - right[0])
      .map(([, ...item]) => item),
  });
}
