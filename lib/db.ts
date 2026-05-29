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
  `)
}

export default getDb
