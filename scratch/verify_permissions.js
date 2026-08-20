const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '..', 'tabak.db')
console.log('Connecting to DB at:', dbPath)
const db = new Database(dbPath)

// Check users table columns
const columns = db.prepare("PRAGMA table_info(users)").all()
console.log('Users columns:', columns.map(c => c.name))

const hasPermissions = columns.some(c => c.name === 'permissions')
if (!hasPermissions) {
  console.error('FAIL: permissions column missing!')
  process.exit(1)
}

// Check role CHECK constraint
const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get().sql
console.log('Users table SQL:', sql)

if (!sql.includes('superadmin') || !sql.includes('admin')) {
  console.error('FAIL: superadmin or admin role missing in CHECK constraint!')
  process.exit(1)
}

console.log('SUCCESS: Users table schema verified successfully!')
