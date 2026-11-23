const dateFormatter = new Intl.DateTimeFormat('ru', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});

// Единый формат даты для экранов: «23 ноября 2026» без служебного «г.».
export function formatDate(value) {
  const raw = String(value ?? '').slice(0, 10);
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return dateFormatter.format(date).replace(/\s*г\.$/, '');
}
