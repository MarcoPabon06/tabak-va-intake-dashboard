const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '../tabak.db');

console.log('Connecting to database at:', DB_PATH);
const db = new Database(DB_PATH);

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coaching_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      linked_evaluation_id INTEGER,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Scheduled', 'Declined', 'Completed')),
      requested_at TEXT DEFAULT (datetime('now')),
      preferred_date TEXT,
      agent_notes TEXT,
      coach_notes TEXT,
      scheduled_coaching_id INTEGER,
      FOREIGN KEY(linked_evaluation_id) REFERENCES qa_evaluations(id),
      FOREIGN KEY(scheduled_coaching_id) REFERENCES coaching_sessions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_coaching_requests_agent ON coaching_requests(agent_name);
    CREATE INDEX IF NOT EXISTS idx_coaching_requests_status ON coaching_requests(status);
  `);
  console.log('Coaching requests migration executed successfully!');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}
