import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openAppDatabase } from '../src/db/open.js';
import { runningDemoClock } from '../src/modules/clock.js';
import { resolveModules } from '../src/modules/catalog.js';
import { startServer } from '../src/server.js';
import { seedNewDemoModules } from './seed.js';
import { setupDemo } from './setup.js';
import { copyLeadershipDemo, setupLeadershipDemo, setupOfficeDemo, setupTeacherDemo } from './staff.js';

const databaseName = 'deanery.sqlite';
const activeFile = root => join(root, 'current');

async function createBaseline(root, baseline, modules) {
  const baselineFile = join(baseline, databaseName);
  if (existsSync(baselineFile)) {
    if (modules && !modules.has('urgent-appeals')) return [];
    const db = openAppDatabase(baselineFile, { modules });
    try {
      return await setupLeadershipDemo(db);
    } finally {
      db.close();
    }
  }
  const staging = mkdtempSync(join(root, 'baseline-'));
  try {
    const db = openAppDatabase(join(staging, databaseName), { modules });
    let accounts;
    try {
      accounts = await setupDemo(db);
      accounts.push(...[await setupOfficeDemo(db), await setupTeacherDemo(db)].filter(Boolean));
      accounts.push(...await setupLeadershipDemo(db));
    } finally {
      db.close();
    }
    try {
      renameSync(staging, baseline);
      return accounts;
    } catch (error) {
      if (['EEXIST', 'ENOTEMPTY'].includes(error.code) && existsSync(join(baseline, databaseName))) return [];
      throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

function currentDatabase(root) {
  let name;
  try {
    name = readFileSync(activeFile(root), 'utf8').trim();
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (/^run-[\da-zA-Z]{6}$/.test(name)) {
    const file = join(root, name, databaseName);
    if (existsSync(file)) return file;
  }
  throw new Error('Текущая база демо не найдена. Для чистого запуска выберите «Начать с начала».');
}

async function upgradeDemo(filename, modules, baselineFile) {
  const db = openAppDatabase(filename, { modules });
  try {
    seedNewDemoModules(db);
    if (!existsSync(baselineFile)) return await setupLeadershipDemo(db);
    copyLeadershipDemo(db, baselineFile);
    return [];
  } finally {
    db.close();
  }
}

export async function prepareDemo(root, { fresh = false, modules } = {}) {
  const current = fresh ? undefined : currentDatabase(root);
  const baseline = join(root, 'baseline');
  const baselineFile = join(baseline, databaseName);
  if (current) {
    const accounts = existsSync(baselineFile) ? await createBaseline(root, baseline, modules) : [];
    accounts.push(...await upgradeDemo(current, modules, baselineFile));
    return { filename: current, accounts, activate() {} };
  }

  mkdirSync(root, { recursive: true, mode: 0o700 });
  const accounts = await createBaseline(root, baseline, modules);
  const run = mkdtempSync(join(root, 'run-'));
  const filename = join(run, databaseName);
  const pending = join(run, 'current');
  try {
    copyFileSync(baselineFile, filename);
    await upgradeDemo(filename, modules, baselineFile);
    writeFileSync(pending, `${basename(run)}\n`);
  } catch (error) {
    rmSync(run, { recursive: true, force: true });
    throw error;
  }
  // Рабочая копия меняется только после успешного запуска сервера.
  return { filename, accounts, activate: () => renameSync(pending, activeFile(root)) };
}

async function chooseFresh(root, flags) {
  if (flags.length === 1 && flags[0] === '--fresh') return true;
  if (flags.length === 1 && flags[0] === '--resume') return false;
  if (flags.length) throw new Error('Используйте npm run dev, npm run dev -- --resume или npm run dev -- --fresh.');
  if (!existsSync(activeFile(root)) || !process.stdin.isTTY) return false;

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (await prompt.question('1. Продолжить с прошлого запуска\n2. Начать с начала\nВыбор [1]: ')).trim();
      if (answer === '2') return true;
      if (answer === '' || answer === '1') return false;
      console.log('Введите 1 или 2.');
    }
  } finally {
    prompt.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.env.NODE_ENV === 'production') throw new Error('Для production используйте npm start.');
    const selection = process.env.DEANERY_MODULES ?? 'full';
    const modules = resolveModules(selection);
    const demoPath = selection.trim() === 'full' ? '../var/demo-dev/' : `../var/demo-dev/modules-${modules.key}/`;
    const root = fileURLToPath(new URL(demoPath, import.meta.url));
    const demo = await prepareDemo(root, { modules, fresh: await chooseFresh(root, process.argv.slice(2)) });
    if (demo.accounts.length) {
      console.log('Демо-аккаунты. Сохраните выданные пароли.');
      for (const { login, password } of demo.accounts) console.log(`${login}  ${password}`);
    }
    const startedAt = statSync(dirname(demo.filename)).birthtimeMs || Date.now();
    const server = startServer({ filename: demo.filename, modules, now: runningDemoClock(startedAt), defaultPort: 3100, onListen: () => {
      demo.activate();
      console.log(`Рабочая база демо: ${demo.filename}`);
    } });
    server.once('error', error => {
      console.error(`Сервер демо не запущен. ${error.message}`);
      process.exitCode = 1;
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
