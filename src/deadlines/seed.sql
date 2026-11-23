INSERT INTO deadlines (id, group_code, title, due_date, created_at)
VALUES (1, 'Р-21', 'Сдать обзор источников по истории региона', '2026-11-25', '2026-11-22 05:00:00')
ON CONFLICT(id) DO NOTHING;
