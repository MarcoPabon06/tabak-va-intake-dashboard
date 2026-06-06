// One-time migration: create notifications table and indexes
// Run with: node scripts/migrate-notifications.js
const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'tabak.db')

console.log('🔧 Running notifications migration on:', DB_PATH)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

// Create notifications table
db.exec(`
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
`)
console.log('✅ notifications table and indexes ready')

db.close()
console.log('🚀 Migration complete!')
