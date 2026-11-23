INSERT INTO campus_buildings (id, name, address) VALUES
  (1, 'Учебный корпус 1', 'Учебная улица, 12'),
  (2, 'Языковой корпус', 'Университетский проезд, 4'),
  (3, 'Учебный корпус 2', 'Учебная улица, 18')
ON CONFLICT (id) DO UPDATE SET name = excluded.name
WHERE campus_buildings.id = 1 AND campus_buildings.name = 'Учебный корпус';

INSERT INTO campus_building_hours (building_id, weekday, opens_at, closes_at) VALUES
  (1, 1, '07:30', '21:00'),
  (1, 2, '07:30', '21:00'),
  (1, 3, '07:30', '21:00'),
  (1, 4, '07:30', '21:00'),
  (1, 5, '07:30', '20:00'),
  (1, 6, '09:00', '16:00'),
  (2, 1, '09:00', '19:00'),
  (2, 2, '09:00', '19:00'),
  (2, 3, '09:00', '19:00'),
  (2, 4, '09:00', '19:00'),
  (2, 5, '09:00', '18:00'),
  (3, 1, '08:00', '20:00'),
  (3, 2, '08:00', '20:00'),
  (3, 3, '08:00', '20:00'),
  (3, 4, '08:00', '20:00'),
  (3, 5, '08:00', '20:00')
ON CONFLICT (building_id, weekday) DO NOTHING;

INSERT INTO campus_room_locations (room, building_id) VALUES
  ('214', 1), ('215', 1), ('301', 1), ('307', 1), ('310', 1), ('312', 1),
  ('118', 3), ('204', 3), ('425', 3), ('509', 3), ('516', 3), ('518', 3)
ON CONFLICT (room) DO NOTHING;
