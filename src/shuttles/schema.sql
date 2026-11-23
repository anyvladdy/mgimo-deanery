CREATE TABLE IF NOT EXISTS shuttle_dorm_assignments (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  residence TEXT NOT NULL CHECK (residence = 'dubki')
);

CREATE TABLE IF NOT EXISTS shuttle_routes (
  id TEXT PRIMARY KEY NOT NULL,
  service TEXT NOT NULL CHECK (service IN ('campus', 'dubki')),
  direction INTEGER NOT NULL CHECK (direction IN (1, 2)),
  UNIQUE (service, direction)
);

CREATE TABLE IF NOT EXISTS shuttle_stops (
  route_id TEXT NOT NULL REFERENCES shuttle_routes(id),
  position INTEGER NOT NULL CHECK (position > 0),
  name TEXT NOT NULL,
  PRIMARY KEY (route_id, position)
);

CREATE TABLE IF NOT EXISTS shuttle_departures (
  route_id TEXT NOT NULL REFERENCES shuttle_routes(id),
  day_kind TEXT NOT NULL CHECK (day_kind IN ('weekday', 'weekend')),
  departure TEXT NOT NULL,
  PRIMARY KEY (route_id, day_kind, departure)
);
