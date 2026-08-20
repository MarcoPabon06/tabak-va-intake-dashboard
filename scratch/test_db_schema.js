const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.resolve('./tabak.db'));

// Test creating table and columns
db.exec(`
  CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT UNIQUE NOT NULL,
    lob TEXT NOT NULL CHECK(lob IN ('VA', 'SSD', 'APPS', 'ALL')),
    upload_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    user_id INTEGER,
    username TEXT NOT NULL,
    user_name TEXT,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    snapshot_data TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'ROLLED_BACK')),
    created_at TEXT DEFAULT (datetime('now')),
    rolled_back_at TEXT,
    rolled_back_by TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_import_batches_lob ON import_batches(lob, created_at);
  CREATE INDEX IF NOT EXISTS idx_import_batches_batch_id ON import_batches(batch_id);
`);

try {
  db.prepare("ALTER TABLE ssd_lead_records ADD COLUMN import_batch_id TEXT").run();
} catch (e) {
  if (!e.message.includes('duplicate column name')) console.error(e.message);
}

try {
  db.prepare("ALTER TABLE va_lead_records ADD COLUMN import_batch_id TEXT").run();
} catch (e) {
  if (!e.message.includes('duplicate column name')) console.error(e.message);
}

console.log('Schema migration verified successfully!');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
