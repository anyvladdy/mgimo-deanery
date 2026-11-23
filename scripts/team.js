import { mkdirSync, realpathSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = process.env.TEAM_JOURNAL || resolve(root, 'journal/team.sqlite');
const [command = 'status', agent, ...args] = process.argv.slice(2);
const usage = 'status | log [агент] | claim агент "задача" путь... | say агент получатель "сообщение" | done агент "результат и проверка"';

function workspacePath(input) {
  const name = relative(root, resolve(root, input)).split(sep).join('/');
  if (!name || name === '..' || name.startsWith('../') || isAbsolute(name)) {
    throw new Error('Укажи файл или папку внутри проекта.');
  }
  let parent = resolve(root, name);
  while (!existsSync(parent)) parent = dirname(parent);
  if (realpathSync(parent) !== parent) throw new Error('Укажи реальный путь без символических ссылок.');
  return name;
}

function overlaps(a, b) {
  // Единое правило для регистрозависимых и регистронезависимых файловых систем.
  a = a.normalize('NFC').toLowerCase();
  b = b.normalize('NFC').toLowerCase();
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

mkdirSync(dirname(file), { recursive: true });
const db = new DatabaseSync(file);
try {
  db.exec(`
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS claims (path TEXT PRIMARY KEY, agent TEXT NOT NULL, task TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY, stamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      agent TEXT NOT NULL, recipient TEXT NOT NULL, message TEXT NOT NULL
    );
  `);
  const record = (from, to, message) => db.prepare(
    'INSERT INTO events (agent, recipient, message) VALUES (?, ?, ?)'
  ).run(from, to, message);

  if (command === 'status') {
    const rows = db.prepare('SELECT * FROM claims ORDER BY agent, path').all();
    for (const row of rows) console.log(`${row.agent} · ${row.path} · ${row.task}`);
    if (!rows.length) console.log('Все пути свободны.');
  } else if (command === 'log') {
    const rows = db.prepare(`
      SELECT * FROM events WHERE ? IS NULL OR recipient IN ('all', ?) OR agent = ? ORDER BY id
    `).all(agent ?? null, agent ?? null, agent ?? null);
    for (const row of rows) console.log(`#${row.id} · ${row.stamp} UTC · ${row.agent} → ${row.recipient} · ${row.message}`);
    if (!rows.length) console.log('Записей пока нет.');
  } else {
    if (!agent || agent === 'all') throw new Error(usage);
    db.exec('BEGIN IMMEDIATE');
    if (command === 'claim') {
      const [task, ...inputs] = args;
      if (!task || !inputs.length) throw new Error(usage);
      const paths = [...new Set(inputs.map(workspacePath))];
      const claims = db.prepare('SELECT * FROM claims').all();
      for (const path of paths) {
        const conflict = claims.find(row => overlaps(row.path, path));
        if (conflict) throw new Error(`Занято: ${conflict.path} · ${conflict.agent} · ${conflict.task}`);
        db.prepare('INSERT INTO claims VALUES (?, ?, ?)').run(path, agent, task);
      }
      record(agent, 'all', `Взял в работу: ${task}. Пути: ${paths.join(', ')}`);
    } else if (command === 'say' && args.length === 2 && args.every(Boolean)) {
      record(agent, args[0], args[1]);
    } else if (command === 'done' && args.length === 1 && args[0]) {
      const held = db.prepare('SELECT path FROM claims WHERE agent = ? ORDER BY path').all(agent);
      if (!held.length) throw new Error('У этого агента нет занятых путей.');
      record(agent, 'all', `Передача работы: ${args[0]}. Освобождены: ${held.map(row => row.path).join(', ')}`);
      db.prepare('DELETE FROM claims WHERE agent = ?').run(agent);
    } else {
      throw new Error(usage);
    }
    db.exec('COMMIT');
    console.log('Записано в журнал.');
  }
} catch (error) {
  if (db.isTransaction) db.exec('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
