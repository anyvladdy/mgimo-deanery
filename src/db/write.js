export function writeTransaction(db, change) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = change();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
