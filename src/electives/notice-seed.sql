INSERT INTO notices (id, group_code, kind, message, notice_date) VALUES
  (12, 'Э-11', 'Срок', 'До 27 ноября проверьте, выбрана ли дисциплина в блоке «Аналитика и данные».', '2026-11-22')
ON CONFLICT(id) DO NOTHING;
INSERT INTO notice_requirements VALUES (12, 'electives') ON CONFLICT DO NOTHING;
INSERT INTO notice_choice_blocks (notice_id, block_id) VALUES (12, 12)
ON CONFLICT(notice_id) DO NOTHING;
