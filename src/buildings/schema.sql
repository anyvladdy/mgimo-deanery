CREATE TABLE IF NOT EXISTS campus_buildings (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campus_building_hours (
  building_id INTEGER NOT NULL REFERENCES campus_buildings(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL CHECK (closes_at > opens_at),
  PRIMARY KEY (building_id, weekday)
);

CREATE TABLE IF NOT EXISTS campus_room_locations (
  room TEXT PRIMARY KEY NOT NULL,
  building_id INTEGER NOT NULL REFERENCES campus_buildings(id)
);
