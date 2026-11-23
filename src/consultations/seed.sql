INSERT INTO consultation_slots (staff_id, subject, group_code, slot_date, starts_at, ends_at, room, mode, capacity, note, created_at)
SELECT a.id, 'Регионоведение', g.code, '2026-11-25', '14:00', '14:30', '214', 'offline', 3,
  'Можно обсудить подготовку к экзамену.', '2026-11-23 05:00:00'
FROM staff_accounts a CROSS JOIN academic_groups g
WHERE a.login = 'teacher-demo' AND a.role = 'teacher' AND g.code = 'Р-21'
AND NOT EXISTS (
  SELECT 1 FROM consultation_slots c WHERE c.staff_id = a.id AND c.subject = 'Регионоведение'
    AND c.slot_date = '2026-11-25' AND c.starts_at = '14:00'
);
