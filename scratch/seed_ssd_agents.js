const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('./tabak.db');
const db = new Database(dbPath);

// Ensure ssd_lead_records and upload_audit_logs tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS va_lead_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_name TEXT NOT NULL,
    rep_username TEXT NOT NULL,
    veteran_name TEXT NOT NULL,
    lead_id TEXT,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    outcome_reason TEXT,
    other_reason_notes TEXT,
    signed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_edited_by TEXT
  );

  CREATE TABLE IF NOT EXISTS ssd_lead_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rep_name TEXT NOT NULL,
    rep_username TEXT NOT NULL,
    client_name TEXT NOT NULL,
    lead_id TEXT,
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    claim_type TEXT,
    outcome_reason TEXT,
    other_reason_notes TEXT,
    signed_at TEXT,
    converted_at TEXT,
    is_converted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    last_edited_by TEXT
  );

  CREATE TABLE IF NOT EXISTS upload_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT NOT NULL,
    user_name TEXT,
    upload_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    file_hash_sha256 TEXT NOT NULL,
    rows_processed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    details TEXT,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const ssdReps = [
  'Felipe Latriglia',
  'Ana Salas',
  'Karen Morales',
  'Luis Cepeda',
  'Jair Torres',
  'Laura Romero',
  'Daniel Ayala',
  'Kevin Morantes',
  'Oscar Botello'
];

for (const rep of ssdReps) {
  const existing = db.prepare("SELECT * FROM agents WHERE LOWER(name) = LOWER(?)").get(rep);
  if (!existing) {
    db.prepare("INSERT INTO agents (name, active, lob) VALUES (?, 1, 'SSD')").run(rep);
    console.log(`Inserted SSD agent: ${rep}`);
  } else {
    db.prepare("UPDATE agents SET lob = 'SSD', active = 1 WHERE id = ?").run(existing.id);
    console.log(`Updated agent to SSD: ${rep}`);
  }
}

console.log('All SSD agents initialized successfully!');
