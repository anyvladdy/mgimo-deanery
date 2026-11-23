INSERT INTO academic_programs (name, faculty)
SELECT program, MIN(faculty) FROM students
GROUP BY program HAVING COUNT(DISTINCT faculty) = 1
ON CONFLICT(name) DO NOTHING;

INSERT INTO academic_groups (code, program, year)
SELECT group_code, MIN(program), MIN(year) FROM students
GROUP BY group_code
HAVING COUNT(DISTINCT program) = 1 AND COUNT(DISTINCT year) = 1
  AND COUNT(DISTINCT faculty) = 1
  AND EXISTS (SELECT 1 FROM academic_programs p WHERE p.name = students.program AND p.faculty = students.faculty)
ON CONFLICT(code) DO NOTHING;
