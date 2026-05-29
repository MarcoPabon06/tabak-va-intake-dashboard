// Seed script — run with: node scripts/seed.js
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const path = require('path')
const fs = require('fs')

// Use DATABASE_PATH env var (Railway volume) or fall back to local
const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'tabak.db')

// Seed JSON is only available locally — skip on cloud deployments
const SEED_DATA_PATH = path.join(__dirname, '..', '..', 'acumulado_seed.json')

console.log('🌱 Seeding database:', DB_PATH)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─── Schema ─────────────────────────────────────────────────────────────────
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
`)

console.log('✅ Schema ready')

// ─── Users ───────────────────────────────────────────────────────────────────
const USERS = [
  { username: 'admin',      password: 'admin123',  role: 'master',   display_name: 'Administrator' },
  { username: 'daniel',     password: 'tabak2025', role: 'regular',  display_name: 'Daniel Castillo' },
  { username: 'adriana',    password: 'tabak2025', role: 'regular',  display_name: 'Adriana Soto' },
  { username: 'oliver',     password: 'tabak2025', role: 'regular',  display_name: 'Oliver Ortega' },
  { username: 'alejandra',  password: 'tabak2025', role: 'regular',  display_name: 'Alejandra NicoleReyes' },
  { username: 'omar',       password: 'tabak2025', role: 'regular',  display_name: 'Omar Soto' },
]

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (username, password_hash, role, display_name)
  VALUES (@username, @password_hash, @role, @display_name)
`)

for (const u of USERS) {
  const hash = bcrypt.hashSync(u.password, 10)
  insertUser.run({ username: u.username, password_hash: hash, role: u.role, display_name: u.display_name })
  console.log(`  👤 ${u.username} (${u.role})`)
}
console.log('✅ Users seeded')

// ─── Agents ──────────────────────────────────────────────────────────────────
const CURRENT_AGENTS = [
  'Daniel Castillo',
  'Adriana Soto',
  'Oliver Ortega',
  'Alejandra NicoleReyes',
  'Omar Soto',
]

const insertAgent = db.prepare(`INSERT OR IGNORE INTO agents (name, active) VALUES (?, 1)`)
for (const name of CURRENT_AGENTS) {
  insertAgent.run(name)
}
console.log('✅ Agents seeded')

// ─── Historical data ──────────────────────────────────────────────────────────
if (!fs.existsSync(SEED_DATA_PATH)) {
  console.warn('⚠️  Seed data file not found at:', SEED_DATA_PATH)
  console.warn('    Skipping historical data import.')
  process.exit(0)
}

const seedData = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf-8'))
console.log(`📊 Importing ${seedData.length} historical records…`)

const insertPerf = db.prepare(`
  INSERT INTO daily_performance (
    date, agent_name, capd, inbound_calls, case_rejected, crh,
    signed_retainers, unsigned_retainers, total_case_wanted,
    signed_success_rate, week_label, present
  ) VALUES (
    @date, @agent_name, @capd, @inbound_calls, @case_rejected, @crh,
    @signed_retainers, @unsigned_retainers, @total_case_wanted,
    @signed_success_rate, @week_label, @present
  )
  ON CONFLICT(date, agent_name) DO UPDATE SET
    capd = excluded.capd,
    inbound_calls = excluded.inbound_calls,
    case_rejected = excluded.case_rejected,
    crh = excluded.crh,
    signed_retainers = excluded.signed_retainers,
    unsigned_retainers = excluded.unsigned_retainers,
    total_case_wanted = excluded.total_case_wanted,
    signed_success_rate = excluded.signed_success_rate,
    week_label = excluded.week_label,
    present = excluded.present
`)

const importAll = db.transaction((rows) => {
  let count = 0
  for (const row of rows) {
    insertPerf.run({
      date: row.date,
      agent_name: row.agent_name,
      capd: row.capd || 0,
      inbound_calls: row.inbound_calls || 0,
      case_rejected: row.case_rejected || 0,
      crh: row.crh || 0,
      signed_retainers: row.signed_retainers || 0,
      unsigned_retainers: row.unsigned_retainers || 0,
      total_case_wanted: row.total_case_wanted || 0,
      signed_success_rate: row.signed_success_rate || 0,
      week_label: row.week_label || '',
      present: row.present || 'SI',
    })
    count++
  }
  return count
})

const imported = importAll(seedData)
console.log(`✅ ${imported} records imported from historical data`)

const total = db.prepare('SELECT COUNT(*) as cnt FROM daily_performance').get()
const agentList = db.prepare('SELECT DISTINCT agent_name FROM daily_performance ORDER BY agent_name').all()
console.log(`\n📈 Database summary:`)
console.log(`   Total performance records: ${total.cnt}`)
console.log(`   Agents with data: ${agentList.map(a => a.agent_name).join(', ')}`)
console.log(`\n🚀 Seed complete! Run "npm run dev" to start the server.`)
console.log(`   Login: admin / admin123`)
console.log(`   Agent logins: daniel/adriana/oliver/alejandra/omar — password: tabak2025`)

db.close()
