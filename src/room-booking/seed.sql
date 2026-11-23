INSERT INTO bookable_rooms (code, building, capacity) VALUES
  ('214', 'Учебный корпус 1', 16),
  ('215', 'Учебный корпус 1', 24),
  ('307', 'Учебный корпус 1', 32),
  ('118', 'Учебный корпус 2', 20),
  ('204', 'Учебный корпус 2', 28)
ON CONFLICT (code) DO UPDATE SET building = excluded.building
WHERE bookable_rooms.code IN ('214', '215', '307') AND bookable_rooms.building = 'Учебный корпус';
