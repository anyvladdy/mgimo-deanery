INSERT INTO assignments (group_code, subject, assessment, title, description, due_date, created_by, published_at, request_key)
SELECT a.group_code, a.subject, a.assessment, 'Обзор первичных источников',
  'Выберите два открытых источника по региональной политике. Объясните, что каждый из них помогает понять, и приложите ссылки.',
  '2026-11-27', s.id, '2026-11-22 06:00:00', 'demo-source-review'
FROM teaching_assignments a JOIN staff_accounts s ON s.id = a.staff_id
WHERE s.login = 'teacher-demo' AND a.group_code = 'Р-21' AND a.subject = 'Регионоведение' AND a.assessment = 'Экзамен'
ON CONFLICT (created_by, request_key) DO NOTHING;
