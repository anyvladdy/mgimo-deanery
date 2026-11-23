export function snapshotCurriculum(db, groupCode, versionId) {
  db.prepare(`
    INSERT INTO plan_published_groups (group_code, version)
    SELECT group_code, version FROM curriculum_versions WHERE id = ? AND group_code = ? AND state = 'published'
    ON CONFLICT (group_code) DO UPDATE SET version = excluded.version
  `).run(versionId, groupCode);
  db.prepare('DELETE FROM plan_published_courses WHERE group_code = ?').run(groupCode);
  db.prepare(`
    INSERT INTO plan_published_courses (group_code, subject, assessment, credits)
    SELECT ?, subject, assessment, credits FROM curriculum_courses WHERE version_id = ?
  `).run(groupCode, versionId);
}
