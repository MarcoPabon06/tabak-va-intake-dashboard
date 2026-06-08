import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'tabak.db')

let db: Database.Database

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
  }
  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('master', 'regular')),
      display_name TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS daily_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      capd INTEGER DEFAULT 0,
      inbound_calls INTEGER DEFAULT 0,
      case_rejected INTEGER DEFAULT 0,
      crh INTEGER DEFAULT 0,
      signed_retainers INTEGER DEFAULT 0,
      unsigned_retainers INTEGER DEFAULT 0,
      total_case_wanted INTEGER DEFAULT 0,
      signed_success_rate REAL DEFAULT 0,
      week_label TEXT DEFAULT '',
      present TEXT DEFAULT 'SI',
      ura INTEGER DEFAULT 0,
      reprocess INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, agent_name)
    );

    CREATE INDEX IF NOT EXISTS idx_perf_date ON daily_performance(date);
    CREATE INDEX IF NOT EXISTS idx_perf_agent ON daily_performance(agent_name);
    CREATE INDEX IF NOT EXISTS idx_perf_date_agent ON daily_performance(date, agent_name);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

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
      status TEXT DEFAULT 'Pending Acknowledgement',
      acknowledged_at TEXT,
      dispute_reason TEXT,
      disputed_at TEXT,
      resolution_notes TEXT,
      resolved_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_qa_agent ON qa_evaluations(agent_name);
    CREATE INDEX IF NOT EXISTS idx_qa_date ON qa_evaluations(eval_date);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(username);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

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
    CREATE INDEX IF NOT EXISTS idx_coaching_agent ON coaching_sessions(agent_name);

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
    CREATE INDEX IF NOT EXISTS idx_pip_agent ON pip_plans(agent_name);
  `)

  // Run self-healing schema migrations for new columns
  const alterColumns = [
    { table: 'users', column: 'display_name', definition: 'TEXT' },
    { table: 'users', column: 'active', definition: 'INTEGER DEFAULT 1' },
    { table: 'qa_evaluations', column: 'status', definition: "TEXT DEFAULT 'Pending Acknowledgement'" },
    { table: 'qa_evaluations', column: 'acknowledged_at', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'dispute_reason', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'disputed_at', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'resolution_notes', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'resolved_at', definition: 'TEXT' },
  ]

  for (const alter of alterColumns) {
    try {
      db.prepare(`ALTER TABLE ${alter.table} ADD COLUMN ${alter.column} ${alter.definition}`).run()
    } catch (e: any) {
      // Silently ignore if column already exists
      if (!e.message.includes('duplicate column name') && !e.message.includes('already exists')) {
        console.error(`Failed to alter table ${alter.table} add ${alter.column}:`, e.message)
      }
    }
  }

  // Seed default settings if empty
  const count = db.prepare('SELECT COUNT(*) as cnt FROM settings').get() as any
  if (count.cnt === 0) {
    const defaults = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    defaults.run('goal_signed_retainers', '35')
    defaults.run('goal_conversion_rate', '65')
    defaults.run('goal_avg_capd', '40')
  }

  // Clean up any QA evaluations, coaching sessions, PIP plans, and agents not in the allowed list of VA Intake Reps
  const allowedAgents = ['Omar Soto', 'Alejandra NicoleReyes', 'Alejandra Nicole Reyes', 'Adriana Soto', 'Oliver Ortega', 'Daniel Castillo']
  const placeholders = allowedAgents.map(() => '?').join(',')
  
  db.prepare(`DELETE FROM qa_evaluations WHERE agent_name NOT IN (${placeholders})`).run(...allowedAgents)
  db.prepare(`DELETE FROM coaching_sessions WHERE agent_name NOT IN (${placeholders})`).run(...allowedAgents)
  db.prepare(`DELETE FROM pip_plans WHERE agent_name NOT IN (${placeholders})`).run(...allowedAgents)
  db.prepare(`DELETE FROM agents WHERE name NOT IN (${placeholders})`).run(...allowedAgents)
}

export default getDb
