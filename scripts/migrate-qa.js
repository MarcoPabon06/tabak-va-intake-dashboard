// One-time migration: add Brayan Requena as master user + create qa_evaluations table
// Run with: node scripts/migrate-qa.js
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const path = require('path')

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'tabak.db')

console.log('🔧 Running QA migration on:', DB_PATH)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Create qa_evaluations table
db.exec(`
  CREATE TABLE IF NOT EXISTS qa_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    evaluator_name TEXT,
    call_id TEXT,
    eval_date TEXT NOT NULL,
    overall_score REAL NOT NULL,
    score_introduction REAL DEFAULT 0,
    score_pk_policies REAL DEFAULT 0,
    score_eligibility REAL DEFAULT 0,
    score_deadline REAL DEFAULT 0,
    score_documentation REAL DEFAULT 0,
    score_objection REAL DEFAULT 0,
    zt_attorney_escalation INTEGER DEFAULT 0,
    zt_legal_misrepresentation INTEGER DEFAULT 0,
    zt_undocumented INTEGER DEFAULT 0,
    feedback TEXT,
    tier TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_qa_agent ON qa_evaluations(agent_name);
  CREATE INDEX IF NOT EXISTS idx_qa_date ON qa_evaluations(eval_date);
`)
console.log('✅ qa_evaluations table ready')

// Add Brayan Requena as master user
const hash = bcrypt.hashSync('tabak2025', 10)
const result = db.prepare(
  `INSERT OR IGNORE INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)`
).run('brayan', hash, 'master', 'Brayan Requena')

if (result.changes > 0) {
  console.log('✅ Added user: brayan (master) — Brayan Requena')
} else {
  console.log('ℹ️  User brayan already exists')
}

db.close()
console.log('🚀 Migration complete!')
