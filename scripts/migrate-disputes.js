// One-time migration: add dispute status columns to qa_evaluations
// Run with: node scripts/migrate-disputes.js
const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'tabak.db')

console.log('🔧 Running disputes migration on:', DB_PATH)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

try {
  // Add status column (default to 'Pending Acknowledgement')
  db.exec(`ALTER TABLE qa_evaluations ADD COLUMN status TEXT DEFAULT 'Pending Acknowledgement'`)
  console.log('✅ Added column: status')
} catch (e) {
  console.log('ℹ️  Column status might already exist:', e.message)
}

try {
  db.exec(`ALTER TABLE qa_evaluations ADD COLUMN acknowledged_at TEXT`)
  console.log('✅ Added column: acknowledged_at')
} catch (e) {
  console.log('ℹ️  Column acknowledged_at might already exist:', e.message)
}

try {
  db.exec(`ALTER TABLE qa_evaluations ADD COLUMN dispute_reason TEXT`)
  console.log('✅ Added column: dispute_reason')
} catch (e) {
  console.log('ℹ️  Column dispute_reason might already exist:', e.message)
}

try {
  db.exec(`ALTER TABLE qa_evaluations ADD COLUMN disputed_at TEXT`)
  console.log('✅ Added column: disputed_at')
} catch (e) {
  console.log('ℹ️  Column disputed_at might already exist:', e.message)
}

try {
  db.exec(`ALTER TABLE qa_evaluations ADD COLUMN resolution_notes TEXT`)
  console.log('✅ Added column: resolution_notes')
} catch (e) {
  console.log('ℹ️  Column resolution_notes might already exist:', e.message)
}

try {
  db.exec(`ALTER TABLE qa_evaluations ADD COLUMN resolved_at TEXT`)
  console.log('✅ Added column: resolved_at')
} catch (e) {
  console.log('ℹ️  Column resolved_at might already exist:', e.message)
}

db.close()
console.log('🚀 Migration complete!')
