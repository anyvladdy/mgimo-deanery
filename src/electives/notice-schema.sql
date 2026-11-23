CREATE TABLE IF NOT EXISTS notice_choice_blocks (
  notice_id INTEGER PRIMARY KEY REFERENCES notices(id) ON DELETE CASCADE,
  block_id INTEGER NOT NULL REFERENCES plan_choice_blocks(id) ON DELETE CASCADE
);
