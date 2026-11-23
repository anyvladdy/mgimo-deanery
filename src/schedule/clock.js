import { demoDate } from './schedule.js';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Moscow', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

export function demoNow() {
  return new Date(`${demoDate}T05:00:00Z`);
}

export function schoolDayAt(instant) {
  const { year, month, day, hour, minute, second } = Object.fromEntries(
    formatter.formatToParts(instant).map(({ type, value }) => [type, value]),
  );
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}:${second}` };
}
