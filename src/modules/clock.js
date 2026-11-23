import { AsyncLocalStorage } from 'node:async_hooks';

export const demoDate = '2026-11-23';

const activeClock = new AsyncLocalStorage();

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Moscow', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export function demoNow() {
  return new Date(`${demoDate}T05:00:00Z`);
}

export function runningDemoClock(startedAt = Date.now()) {
  const start = demoNow().getTime();
  return () => new Date(start + Math.max(0, Date.now() - startedAt));
}

export function withSchoolClock(now, next) {
  return activeClock.run(now(), next);
}

export function schoolNow() {
  return activeClock.getStore() ?? new Date();
}

export function parseTimestamp(value) {
  const text = String(value ?? '');
  const sqliteTimestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text);
  return new Date(sqliteTimestamp ? `${text.replace(' ', 'T')}Z` : text);
}

export function schoolDayAt(instant) {
  const { year, month, day, hour, minute, second } = Object.fromEntries(
    formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}:${second}` };
}

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
