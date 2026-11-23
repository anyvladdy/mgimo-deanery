const connections = new WeakMap();

export function bindModules(db, modules) {
  connections.set(db, modules);
}

export function modulesFor(db) {
  const modules = connections.get(db);
  if (!modules) throw new Error('База кабинета должна быть открыта через openDatabase.');
  return modules;
}
