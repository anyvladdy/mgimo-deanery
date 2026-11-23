INSERT INTO student_cards (student_id, card_number)
SELECT id, printf('СБ-%06d', id)
FROM students
WHERE id IN (1, 2, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013)
ON CONFLICT(student_id) DO NOTHING;
