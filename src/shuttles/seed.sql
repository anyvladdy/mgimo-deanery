INSERT INTO shuttle_dorm_assignments (student_id, residence)
SELECT id, 'dubki' FROM students WHERE id IN (2, 1002, 1004, 1006, 1007)
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO shuttle_routes (id, service, direction) VALUES
  ('campus-to-language', 'campus', 1),
  ('campus-to-main', 'campus', 2),
  ('dubki-to-campus', 'dubki', 1),
  ('dubki-to-dorm', 'dubki', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO shuttle_stops (route_id, position, name) VALUES
  ('campus-to-language', 1, 'Учебный корпус 1'),
  ('campus-to-language', 2, 'Библиотека'),
  ('campus-to-language', 3, 'Общежитие 1'),
  ('campus-to-main', 1, 'Общежитие 1'),
  ('campus-to-main', 2, 'Библиотека'),
  ('campus-to-main', 3, 'Учебный корпус 1'),
  ('dubki-to-campus', 1, 'Общежитие «Дубки»'),
  ('dubki-to-campus', 2, 'Станция Одинцово'),
  ('dubki-to-campus', 3, 'Учебный корпус 1'),
  ('dubki-to-dorm', 1, 'Учебный корпус 1'),
  ('dubki-to-dorm', 2, 'Станция Одинцово'),
  ('dubki-to-dorm', 3, 'Общежитие «Дубки»')
ON CONFLICT (route_id, position) DO UPDATE SET name = excluded.name;

INSERT INTO shuttle_departures (route_id, day_kind, departure) VALUES
  ('campus-to-language', 'weekday', '08:20'),
  ('campus-to-language', 'weekday', '11:50'),
  ('campus-to-language', 'weekday', '15:20'),
  ('campus-to-language', 'weekday', '18:00'),
  ('campus-to-language', 'weekend', '10:00'),
  ('campus-to-language', 'weekend', '14:00'),
  ('campus-to-main', 'weekday', '08:45'),
  ('campus-to-main', 'weekday', '12:15'),
  ('campus-to-main', 'weekday', '15:45'),
  ('campus-to-main', 'weekday', '18:25'),
  ('campus-to-main', 'weekend', '10:30'),
  ('campus-to-main', 'weekend', '14:30'),
  ('dubki-to-campus', 'weekday', '08:10'),
  ('dubki-to-campus', 'weekday', '10:10'),
  ('dubki-to-campus', 'weekday', '13:10'),
  ('dubki-to-campus', 'weekend', '10:15'),
  ('dubki-to-campus', 'weekend', '13:30'),
  ('dubki-to-dorm', 'weekday', '12:30'),
  ('dubki-to-dorm', 'weekday', '16:20'),
  ('dubki-to-dorm', 'weekday', '19:00'),
  ('dubki-to-dorm', 'weekend', '13:00'),
  ('dubki-to-dorm', 'weekend', '17:30')
ON CONFLICT (route_id, day_kind, departure) DO NOTHING;
