INSERT INTO student_tuition (student_id, funding, due_date)
SELECT id,
  CASE WHEN id IN (1, 1001, 1003, 1005, 1011) THEN 'paid' ELSE 'budget' END,
  CASE WHEN id IN (1, 1001, 1003, 1005, 1011) THEN '2026-11-30' END
FROM students
WHERE id IN (1, 2, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013)
ON CONFLICT(student_id) DO NOTHING;
