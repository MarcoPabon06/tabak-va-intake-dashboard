const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '..', 'tabak.db')
const db = new Database(dbPath)

try {
  const userTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()
  if (userTableInfo && userTableInfo.sql && (!userTableInfo.sql.includes('permissions') || !userTableInfo.sql.includes('admin'))) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE users_tmp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('master', 'superadmin', 'admin', 'regular')),
        display_name TEXT,
        active INTEGER DEFAULT 1,
        lob TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD', 'APPS')),
        permissions TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO users_tmp (id, username, password_hash, role, display_name, active, lob, created_at)
      SELECT id, username, password_hash, role, display_name, active, lob, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_tmp RENAME TO users;
    `)
    db.pragma('foreign_keys = ON')
    console.log('Migrated users table successfully!')
  } else {
    console.log('Users table already migrated!')
  }
} catch (e) {
  console.error('Migration error:', e)
}
