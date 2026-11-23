CREATE TABLE IF NOT EXISTS bookable_rooms (
  code TEXT PRIMARY KEY NOT NULL,
  building TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS room_bookings (
  id INTEGER PRIMARY KEY,
  room TEXT NOT NULL REFERENCES bookable_rooms(code),
  student_id INTEGER NOT NULL REFERENCES students(id),
  booking_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL CHECK (ends_at > starts_at),
  purpose TEXT NOT NULL CHECK (length(purpose) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL DEFAULT (deanery_timestamp()),
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS room_bookings_availability
ON room_bookings (room, booking_date, starts_at, ends_at) WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS room_bookings_calendar
ON room_bookings (student_id, booking_date, starts_at) WHERE cancelled_at IS NULL;
