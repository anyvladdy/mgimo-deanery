function dayKind(day) {
  const weekday = day.getUTCDay();
  return weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
}

function nextDeparture(departures, date, now) {
  const start = date > now.date ? { date, time: '00:00:00' } : now;
  const day = new Date(`${start.date}T00:00:00Z`);
  for (let offset = 0; offset < 7; offset++) {
    const available = departures[dayKind(day)] ?? [];
    const first = offset === 0 ? available.find(time => `${time}:00` >= start.time) : available[0];
    if (first) return { date: day.toISOString().slice(0, 10), time: first };
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return null;
}

export function timetableForStudent(db, studentId, date, now) {
  const kind = dayKind(new Date(`${date}T00:00:00Z`));
  const routes = db.prepare(`
    SELECT id, service FROM shuttle_routes
    WHERE service = 'campus' OR service = (
      SELECT residence FROM shuttle_dorm_assignments WHERE student_id = ?
    )
    ORDER BY service, direction
  `).all(studentId);
  const getStops = db.prepare('SELECT name FROM shuttle_stops WHERE route_id = ? ORDER BY position');
  const getDepartures = db.prepare(`
    SELECT day_kind, departure FROM shuttle_departures WHERE route_id = ? ORDER BY departure
  `);

  const directions = routes.map(route => {
    const stops = getStops.all(route.id).map(stop => stop.name);
    const byDay = Object.groupBy(getDepartures.all(route.id), row => row.day_kind);
    const departures = Object.fromEntries(
      Object.entries(byDay).map(([key, rows]) => [key, rows.map(row => row.departure)]),
    );
    return {
      service: route.service, stops, departures: departures[kind] ?? [], next: nextDeparture(departures, date, now),
    };
  });
  return { kind, services: Object.groupBy(directions, route => route.service) };
}
