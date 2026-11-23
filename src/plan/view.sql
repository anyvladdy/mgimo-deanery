DROP VIEW IF EXISTS current_plan_courses;
CREATE VIEW current_plan_courses AS
SELECT p.group_code, p.subject, p.assessment, p.credits FROM plan_group_courses p
WHERE NOT EXISTS (SELECT 1 FROM plan_published_groups g WHERE g.group_code = p.group_code)
UNION ALL
SELECT group_code, subject, assessment, credits FROM plan_published_courses;
