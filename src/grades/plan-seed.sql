-- Дополнительные профили получают разные результаты по дисциплинам своей группы.
WITH roster_grades AS (
  SELECT s.id AS student_id, p.subject, p.assessment,
         ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY p.subject) AS position
  FROM students s
  JOIN plan_group_courses p ON p.group_code = s.group_code
  WHERE s.id BETWEEN 1001 AND 1013
)
INSERT INTO grades (id, student_id, subject, assessment, result, exam_date)
SELECT student_id * 100 + position, student_id, subject, assessment,
       CASE
         WHEN position = 3 THEN NULL
         WHEN assessment = 'Зачёт' AND (student_id + position) % 5 = 0 THEN 'Не зачтено'
         WHEN assessment = 'Зачёт' THEN 'Зачтено'
         ELSE CAST(2 + (student_id + position) % 4 AS TEXT)
       END,
       CASE WHEN position = 3 AND assessment = 'Экзамен' THEN '2026-12-21' END
FROM roster_grades WHERE true
ON CONFLICT(id) DO NOTHING;
