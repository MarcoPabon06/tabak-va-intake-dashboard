const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '../tabak.db');

console.log('Running coaching migration on:', dbPath);
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS coaching_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    coach_name TEXT NOT NULL,
    session_date TEXT NOT NULL,
    focus_areas TEXT NOT NULL,
    linked_evaluation_id INTEGER,
    discussion_notes TEXT,
    commitments_agent TEXT,
    commitments_coach TEXT,
    follow_up_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(linked_evaluation_id) REFERENCES qa_evaluations(id)
  );
`);

console.log('Coaching sessions table migration completed successfully.');
