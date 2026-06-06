const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '../tabak.db');

console.log('Running PIP migration on:', dbPath);
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS pip_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    target_score REAL NOT NULL,
    current_avg_score REAL,
    status TEXT DEFAULT 'Active',
    check_in_frequency TEXT,
    attachment_path TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('pip_plans table migration completed successfully.');
