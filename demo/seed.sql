-- Вымышленная неделя с понедельника 23 ноября 2026 года.
INSERT INTO students VALUES
  (1, 'Мира Луговая', 'Международные отношения', 'Регионоведение', 2, 'Р-21'),
  (2, 'Марк Ясный', 'Международная экономика', 'Экономика', 1, 'Э-11') ON CONFLICT(id) DO NOTHING;
INSERT INTO lessons VALUES
  (101, 'Р-21', 'Английский язык', 'А. Л. Белова', '2026-11-23', '10:40', '12:10', '214'),
  (102, 'Р-21', 'История региона', 'Е. Ю. Степнов', '2026-11-25', '09:00', '10:30', '118'),
  (201, 'Э-11', 'Микроэкономика', 'В. А. Лесова', '2026-11-23', '10:40', '12:10', '215') ON CONFLICT(id) DO NOTHING;
INSERT INTO room_changes (id, lesson_id, new_room) VALUES (1, 101, '307') ON CONFLICT(id) DO NOTHING;
-- Заранее подготовленная заявка Миры: на ней виден статус «Готова».
INSERT INTO document_requests (student_id, kind, status, created_at)
SELECT 1, 'Справка об обучении', 'Готова', '2026-11-18 09:15:00'
WHERE NOT EXISTS (
  SELECT 1 FROM document_requests WHERE student_id = 1 AND status = 'Готова'
);
-- Ведомость: оценки, зачёты и предстоящие экзамены двух студентов.
INSERT INTO grades (id, student_id, subject, assessment, result, exam_date) VALUES
  (1, 1, 'Английский язык', 'Экзамен', '5', NULL),
  (2, 1, 'История региона', 'Зачёт', 'Зачтено', NULL),
  (3, 1, 'Регионоведение', 'Экзамен', NULL, '2026-12-15'),
  (4, 2, 'Микроэкономика', 'Экзамен', '4', NULL),
  (5, 2, 'Математика', 'Зачёт', 'Зачтено', NULL),
  (6, 2, 'Экономика', 'Экзамен', NULL, '2026-12-18')
ON CONFLICT(id) DO NOTHING;
