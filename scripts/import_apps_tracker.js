const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')
const path = require('path')
const xlsx = require('xlsx')

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'tabak.db')

const EXCEL_PATH = process.env.APPS_EXCEL_PATH || 'C:\\Users\\andre\\Documents\\Apps Tracker\\Applications Tracker - Andes Team.xlsx'

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.pragma('foreign_keys = OFF')
try {
  const userTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()
  if (userTableInfo && userTableInfo.sql && !userTableInfo.sql.includes('APPS')) {
    db.exec(`
      CREATE TABLE users_tmp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('master', 'regular')),
        display_name TEXT,
        active INTEGER DEFAULT 1,
        lob TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD', 'APPS')),
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO users_tmp SELECT id, username, password_hash, role, display_name, active, lob, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_tmp RENAME TO users;
    `)
  }

  const agentTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'").get()
  if (agentTableInfo && agentTableInfo.sql && !agentTableInfo.sql.includes('APPS')) {
    db.exec(`
      CREATE TABLE agents_tmp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        active INTEGER DEFAULT 1,
        lob TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD', 'APPS'))
      );
      INSERT INTO agents_tmp SELECT id, name, active, lob FROM agents;
      DROP TABLE agents;
      ALTER TABLE agents_tmp RENAME TO agents;
    `)
  }
} catch (err) {
  console.error('Migration notice:', err.message)
}
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS apps_team_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id TEXT UNIQUE NOT NULL,
    client_name TEXT NOT NULL,
    date_completed TEXT NOT NULL,
    converted TEXT NOT NULL CHECK(converted IN ('YES', 'NO')),
    reason_not_converted TEXT,
    other_reason TEXT,
    rep_username TEXT NOT NULL,
    rep_name TEXT NOT NULL,
    converted_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_apps_lead ON apps_team_entries(lead_id);
  CREATE INDEX IF NOT EXISTS idx_apps_date ON apps_team_entries(date_completed);
  CREATE INDEX IF NOT EXISTS idx_apps_converted ON apps_team_entries(converted);
  CREATE INDEX IF NOT EXISTS idx_apps_rep ON apps_team_entries(rep_username);
`)

// Helper: Convert Excel Serial Date to YYYY-MM-DD
function parseExcelDate(val) {
  if (!val) return new Date().toISOString().slice(0, 10)
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000))
    return dateObj.toISOString().slice(0, 10)
  }
  const dateStr = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

// Helper: Normalize Rep Username
function getRepUsername(name) {
  if (!name) return 'apps_rep'
  const trimmed = name.trim().toLowerCase()
  if (trimmed.includes('estefani')) return 'ecubides'
  if (trimmed.includes('samantha')) return 'sbenavides'
  return trimmed.replace(/[^a-z0-9]/g, '')
}

// Helper: Standardize Reason
function standardizeReason(rawReason) {
  if (!rawReason) return { category: 'Other', other: '' }
  const r = String(rawReason).trim()
  const lower = r.toLowerCase()

  if (lower.includes('wet 827') || lower.includes('wet reps') || lower.includes('wet 828') || lower.includes('wet 829') || lower.includes('wet 3288')) {
    return { category: 'Need Wet 827', other: r }
  }
  if (lower.includes('need reps') || lower.includes('check reps') || lower.includes('paper app')) {
    return { category: 'Need Reps', other: r }
  }
  if (lower.includes('yellow screen') || lower.includes('cc with ssa')) {
    return { category: 'Yellow Screen (CC with SSA scheduled)', other: r }
  }
  if (lower.includes('rejected')) {
    return { category: 'Rejected (While on Application)', other: r }
  }
  return { category: 'Other', other: r }
}

function runImport() {
  const workbook = xlsx.readFile(EXCEL_PATH)
  const sheet = workbook.Sheets['Matrix'] || workbook.Sheets[workbook.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(sheet)

  console.log(`Read ${rows.length} rows from Excel sheet`)

  const defaultPassword = 'Dashboard$2026'
  const passwordHash = bcrypt.hashSync(defaultPassword, 10)

  const upsertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role, display_name, active, lob)
    VALUES (?, ?, 'regular', ?, 1, 'APPS')
    ON CONFLICT(username) DO UPDATE SET
      display_name = excluded.display_name,
      active = 1,
      lob = 'APPS'
  `)

  const upsertAgent = db.prepare(`
    INSERT INTO agents (name, active, lob)
    VALUES (?, 1, 'APPS')
    ON CONFLICT(name) DO UPDATE SET
      active = 1,
      lob = 'APPS'
  `)

  const upsertEntry = db.prepare(`
    INSERT INTO apps_team_entries (
      lead_id, client_name, date_completed, converted, 
      reason_not_converted, other_reason, rep_username, rep_name, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(lead_id) DO UPDATE SET
      client_name = excluded.client_name,
      date_completed = excluded.date_completed,
      converted = excluded.converted,
      reason_not_converted = excluded.reason_not_converted,
      other_reason = excluded.other_reason,
      rep_username = excluded.rep_username,
      rep_name = excluded.rep_name,
      updated_at = datetime('now')
  `)

  let insertedCount = 0
  let repsSet = new Set()

  db.transaction(() => {
    for (const r of rows) {
      const leadIdRaw = r['Lead ID']
      if (!leadIdRaw) continue

      const leadId = String(leadIdRaw).trim()
      const clientName = String(r["Lead's Name"] || 'Unknown Client').trim()
      const repName = String(r['Apps Representative'] || 'Apps Rep').trim()
      const repUsername = getRepUsername(repName)
      const dateCompleted = parseExcelDate(r['Date'])
      
      const convRaw = String(r['Converted'] || 'No').trim().toUpperCase()
      const converted = (convRaw === 'YES' || convRaw === 'SI') ? 'YES' : 'NO'
      
      const rawReason = r['Reason why it was not converted']
      const { category, other } = standardizeReason(rawReason)

      // Ensure user and agent record exist
      upsertUser.run(repUsername, passwordHash, repName)
      upsertAgent.run(repName)
      repsSet.add(repName)

      // Upsert entry
      upsertEntry.run(
        leadId,
        clientName,
        dateCompleted,
        converted,
        converted === 'NO' ? category : null,
        converted === 'NO' ? other : null,
        repUsername,
        repName
      )
      insertedCount++
    }
  })()

  console.log(`✅ Import finished successfully!`)
  console.log(`   - Imported/Updated Entries: ${insertedCount}`)
  console.log(`   - Apps Team Reps Registered: ${Array.from(repsSet).join(', ')}`)

  const summary = db.prepare(`
    SELECT 
      count(*) as total,
      sum(CASE WHEN converted = 'YES' THEN 1 ELSE 0 END) as converted_count,
      sum(CASE WHEN converted = 'NO' THEN 1 ELSE 0 END) as pending_count
    FROM apps_team_entries
  `).get()

  console.log(`   - Total Applications in DB: ${summary.total}`)
  console.log(`   - Converted (YES): ${summary.converted_count}`)
  console.log(`   - Pending Conversion (NO): ${summary.pending_count}`)
}

try {
  runImport()
} catch (e) {
  console.error('❌ Import failed:', e.message)
}
