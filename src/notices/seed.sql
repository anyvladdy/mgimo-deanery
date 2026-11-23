INSERT INTO notices (id, group_code, kind, message, notice_date) VALUES
  (11, 'Р-21', 'Объявление группы', 'К семинару по истории региона подготовьте два первичных источника.', '2026-11-23')
ON CONFLICT(id) DO NOTHING;
