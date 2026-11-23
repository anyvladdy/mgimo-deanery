-- Заранее подготовленная заявка Миры: на ней виден статус «Готова».
INSERT INTO document_requests (student_id, kind, status, created_at)
SELECT 1, 'Справка об обучении', 'Готова', '2026-11-18 09:15:00'
WHERE NOT EXISTS (
  SELECT 1 FROM document_requests WHERE student_id = 1 AND status = 'Готова'
);
