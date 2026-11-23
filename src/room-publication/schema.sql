CREATE TABLE IF NOT EXISTS room_change_publications (
  change_id INTEGER PRIMARY KEY REFERENCES room_changes(id),
  staff_id INTEGER NOT NULL REFERENCES staff_accounts(id),
  published_at TEXT NOT NULL
);
