import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'tabak.db')

let db: Database.Database

function getDb(): Database.Database {
  if (!db) {
    // Ensure the directory for the database file exists (important for volume mounts)
    const dbDir = path.dirname(DB_PATH)
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    db = new Database(DB_PATH)

    // WAL mode: writes go to a separate WAL file first, then are checkpointed
    // into the main DB file. We set synchronous=NORMAL for a good balance of
    // durability and performance, and run a checkpoint on startup to recover
    // any pages that were left in the WAL from a previous process exit.
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')

    // Checkpoint any leftover WAL pages from a previous run so the main DB
    // file is fully up-to-date before we start serving requests.
    db.pragma('wal_checkpoint(FULL)')

    console.log(`[db] Opened database at ${DB_PATH}`)
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
      role TEXT NOT NULL CHECK(role IN ('master', 'superadmin', 'admin', 'qa', 'regular')),
      display_name TEXT,
      email TEXT,
      active INTEGER DEFAULT 1,
      lob TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD', 'APPS')),
      permissions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      active INTEGER DEFAULT 1,
      lob TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD'))
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
      converted_cases INTEGER DEFAULT 0,
      rfc_sent INTEGER DEFAULT 0,
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

    CREATE TABLE IF NOT EXISTS coaching_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      linked_evaluation_id INTEGER,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Scheduled', 'Declined', 'Completed')),
      requested_at TEXT DEFAULT (datetime('now')),
      preferred_date TEXT,
      agent_notes TEXT,
      coach_notes TEXT,
      scheduled_coaching_id INTEGER,
      FOREIGN KEY(linked_evaluation_id) REFERENCES qa_evaluations(id),
      FOREIGN KEY(scheduled_coaching_id) REFERENCES coaching_sessions(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_coaching_requests_agent ON coaching_requests(agent_name);
    CREATE INDEX IF NOT EXISTS idx_coaching_requests_status ON coaching_requests(status);

    CREATE TABLE IF NOT EXISTS time_off_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      lob TEXT NOT NULL CHECK(lob IN ('VA', 'SSD', 'APPS')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      manager_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(username) REFERENCES users(username)
    );
    CREATE INDEX IF NOT EXISTS idx_timeoff_dates ON time_off_requests(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_timeoff_lob ON time_off_requests(lob);
    CREATE INDEX IF NOT EXISTS idx_timeoff_status ON time_off_requests(status);

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
    CREATE INDEX IF NOT EXISTS idx_apps_converted_at ON apps_team_entries(converted_at);
    CREATE INDEX IF NOT EXISTS idx_apps_rep ON apps_team_entries(rep_username);

    CREATE TABLE IF NOT EXISTS va_lead_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rep_name TEXT NOT NULL,
      rep_username TEXT NOT NULL,
      veteran_name TEXT NOT NULL,
      lead_id TEXT,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Sent E-Sign', 'Sign Follow Up', 'Signed E-Sign', 'Client Refused Help', 'Case Rejected')),
      outcome_reason TEXT,
      other_reason_notes TEXT,
      signed_at TEXT,
      import_batch_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_edited_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_va_leads_date ON va_lead_records(date);
    CREATE INDEX IF NOT EXISTS idx_va_leads_rep ON va_lead_records(rep_username);
    CREATE INDEX IF NOT EXISTS idx_va_leads_date_rep ON va_lead_records(date, rep_username);
    CREATE INDEX IF NOT EXISTS idx_va_leads_date_repname ON va_lead_records(date, rep_name);
    CREATE INDEX IF NOT EXISTS idx_va_leads_status_date ON va_lead_records(status, date);
    CREATE INDEX IF NOT EXISTS idx_va_leads_status ON va_lead_records(status);
    CREATE INDEX IF NOT EXISTS idx_va_leads_lead_id ON va_lead_records(lead_id);

    CREATE TABLE IF NOT EXISTS ssd_lead_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rep_name TEXT NOT NULL,
      rep_username TEXT NOT NULL,
      client_name TEXT NOT NULL,
      lead_id TEXT,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN (
        'Sent E-Sign',
        'Paper Retainer Sent',
        'Signed E-Sign',
        'Client Refused Help',
        'Case Rejected',
        'Sent RFC',
        'Appointment Rescheduled'
      )),
      claim_type TEXT,
      outcome_reason TEXT,
      other_reason_notes TEXT,
      signed_at TEXT,
      converted_at TEXT,
      is_converted INTEGER DEFAULT 0,
      import_batch_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_edited_by TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_date ON ssd_lead_records(date);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_rep ON ssd_lead_records(rep_username);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_date_rep ON ssd_lead_records(date, rep_username);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_date_repname ON ssd_lead_records(date, rep_name);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_status_date ON ssd_lead_records(status, date);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_status ON ssd_lead_records(status);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_lead_id ON ssd_lead_records(lead_id);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_claim_type ON ssd_lead_records(claim_type);
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_converted ON ssd_lead_records(is_converted, date);

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
    CREATE INDEX IF NOT EXISTS idx_upload_audit_user ON upload_audit_logs(username);
    CREATE INDEX IF NOT EXISTS idx_upload_audit_type ON upload_audit_logs(upload_type);
    CREATE INDEX IF NOT EXISTS idx_upload_audit_date ON upload_audit_logs(created_at);

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
    CREATE INDEX IF NOT EXISTS idx_ssd_leads_batch_id ON ssd_lead_records(import_batch_id);
    CREATE INDEX IF NOT EXISTS idx_va_leads_batch_id ON va_lead_records(import_batch_id);
  `)

  // Run self-healing schema migrations for new columns
  const alterColumns = [
    { table: 'users', column: 'display_name', definition: 'TEXT' },
    { table: 'users', column: 'active', definition: 'INTEGER DEFAULT 1' },
    { table: 'users', column: 'lob', definition: "TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD', 'APPS'))" },
    { table: 'agents', column: 'lob', definition: "TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD', 'APPS'))" },
    { table: 'daily_performance', column: 'converted_cases', definition: 'INTEGER DEFAULT 0' },
    { table: 'daily_performance', column: 'rfc_sent', definition: 'INTEGER DEFAULT 0' },
    { table: 'qa_evaluations', column: 'status', definition: "TEXT DEFAULT 'Pending Acknowledgement'" },
    { table: 'qa_evaluations', column: 'acknowledged_at', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'dispute_reason', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'disputed_at', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'resolution_notes', definition: 'TEXT' },
    { table: 'qa_evaluations', column: 'resolved_at', definition: 'TEXT' },
    { table: 'coaching_sessions', column: 'follow_up_status', definition: "TEXT DEFAULT 'Pending'" },
    { table: 'coaching_sessions', column: 'follow_up_notes', definition: 'TEXT' },
    { table: 'coaching_sessions', column: 'follow_up_completed_at', definition: 'TEXT' },
    { table: 'coaching_sessions', column: 'updated_at', definition: 'TEXT' },
    { table: 'coaching_sessions', column: 'last_edited_by', definition: 'TEXT' },
    { table: 'ssd_lead_records', column: 'import_batch_id', definition: 'TEXT' },
    { table: 'va_lead_records', column: 'import_batch_id', definition: 'TEXT' },
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

  // Migrate users table schema if it lacks 'APPS' in CHECK constraint
  try {
    const userTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined
    if (userTableInfo && userTableInfo.sql && !userTableInfo.sql.includes("'APPS'")) {
      db.pragma('foreign_keys = OFF')
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
      db.pragma('foreign_keys = ON')
      console.log('[db] Migrated users table to include APPS LOB CHECK constraint')
    }
  } catch (e: any) {
    console.error('Failed to migrate users schema:', e.message)
  }

  // Migrate agents table schema if it lacks 'APPS' in CHECK constraint
  try {
    const agentTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agents'").get() as { sql: string } | undefined
    if (agentTableInfo && agentTableInfo.sql && !agentTableInfo.sql.includes("'APPS'")) {
      db.pragma('foreign_keys = OFF')
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
      db.pragma('foreign_keys = ON')
      console.log('[db] Migrated agents table to include APPS LOB CHECK constraint')
    }
  } catch (e: any) {
    console.error('Failed to migrate agents schema:', e.message)
  }

  // Migrate time_off_requests table schema if it lacks 'APPS' or 'Cancelled' status in CHECK constraint
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='time_off_requests'").get() as { sql: string } | undefined
    if (tableInfo && tableInfo.sql && (!tableInfo.sql.includes('Cancelled') || !tableInfo.sql.includes("'APPS'"))) {
      db.pragma('foreign_keys = OFF')
      db.exec(`
        CREATE TABLE time_off_requests_tmp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL,
          agent_name TEXT NOT NULL,
          lob TEXT NOT NULL CHECK(lob IN ('VA', 'SSD', 'APPS')),
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          reason TEXT,
          status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
          reviewed_by TEXT,
          reviewed_at TEXT,
          manager_notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY(username) REFERENCES users(username)
        );
        INSERT INTO time_off_requests_tmp SELECT * FROM time_off_requests;
        DROP TABLE time_off_requests;
        ALTER TABLE time_off_requests_tmp RENAME TO time_off_requests;
        CREATE INDEX IF NOT EXISTS idx_timeoff_dates ON time_off_requests(start_date, end_date);
        CREATE INDEX IF NOT EXISTS idx_timeoff_lob ON time_off_requests(lob);
        CREATE INDEX IF NOT EXISTS idx_timeoff_status ON time_off_requests(status);
      `)
      db.pragma('foreign_keys = ON')
      console.log('[db] Migrated time_off_requests table to include APPS LOB & Cancelled status CHECK constraint')
    }
  } catch (e: any) {
    console.error('Failed to migrate time_off_requests schema:', e.message)
  }

  // Migrate users table schema if it lacks 'permissions' or 'email' column or 'admin' role CHECK constraint
  try {
    const userCols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[]
    const hasEmail = userCols.some(c => c.name === 'email')
    if (!hasEmail) {
      db.exec("ALTER TABLE users ADD COLUMN email TEXT")
      console.log('[db] Added email column to users table')
    }

    const userTableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined
    if (userTableInfo && userTableInfo.sql && (!userTableInfo.sql.includes('permissions') || !userTableInfo.sql.includes('admin') || !userTableInfo.sql.includes("'qa'"))) {
      db.pragma('foreign_keys = OFF')
      db.exec(`
        CREATE TABLE users_tmp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('master', 'superadmin', 'admin', 'qa', 'regular')),
          display_name TEXT,
          email TEXT,
          active INTEGER DEFAULT 1,
          lob TEXT DEFAULT 'VA' CHECK(lob IN ('VA', 'SSD', 'APPS')),
          permissions TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO users_tmp (id, username, password_hash, role, display_name, email, active, lob, permissions, created_at)
        SELECT id, username, password_hash, role, display_name, email, active, lob, permissions, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_tmp RENAME TO users;
      `)
      db.pragma('foreign_keys = ON')
      console.log('[db] Migrated users table to include permissions column & superadmin/admin/qa role CHECK constraints')
    }
  } catch (e: any) {
    console.error('Failed to migrate users schema:', e.message)
  }

  // Seed default settings
  const defaults = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
  defaults.run('goal_signed_retainers', '35')
  defaults.run('goal_conversion_rate', '65')
  defaults.run('goal_avg_capd', '40')
  defaults.run('goal_signed_retainers_va', '35')
  defaults.run('goal_conversion_rate_va', '65')
  defaults.run('goal_avg_capd_va', '40')
  defaults.run('goal_converted_cases_ssd', '35')
  defaults.run('goal_conversion_rate_ssd', '65')
  defaults.run('goal_avg_capd_ssd', '40')
  defaults.run('goal_apps_filed_apps', '30')
  defaults.run('goal_conversion_rate_apps', '75')
  defaults.run('goal_converted_cases_apps', '20')
  defaults.run('apps_bonus_rate_per_converted', '25.00')

  // Standardize case-sensitivity on rep names in apps_team_entries
  try {
    db.prepare("UPDATE apps_team_entries SET rep_name = 'Estefani Cubides', rep_username = 'ecubides' WHERE LOWER(rep_name) LIKE '%estefani%'").run()
    db.prepare("UPDATE apps_team_entries SET rep_name = 'Samantha Benavides', rep_username = 'sbenavides' WHERE LOWER(rep_name) LIKE '%samantha%'").run()
    
    // Set Samantha Benavides and Estefani Cubides LOB to APPS in users and agents tables
    db.prepare("UPDATE users SET lob = 'APPS' WHERE LOWER(display_name) LIKE '%samantha%' OR LOWER(display_name) LIKE '%estefani%' OR LOWER(username) LIKE '%samantha%' OR LOWER(username) LIKE '%estefani%' OR LOWER(username) LIKE '%sbenavides%' OR LOWER(username) LIKE '%ecubides%'").run()
    db.prepare("UPDATE agents SET lob = 'APPS' WHERE LOWER(name) LIKE '%samantha%' OR LOWER(name) LIKE '%estefani%'").run()

    // Update Brayan role to Quality Analyst ('qa')
    db.prepare("UPDATE users SET role = 'qa' WHERE LOWER(display_name) LIKE '%brayan%' OR LOWER(username) LIKE '%brayan%'").run()
  } catch {}

  // Clean up any QA evaluations, coaching sessions, PIP plans, and agents not in the registered regular user list
  const users = db.prepare("SELECT display_name FROM users WHERE role = 'regular'").all() as { display_name: string }[]
  const allowedAgents = users.map(u => u.display_name?.trim()).filter(Boolean)
  
  if (allowedAgents.length > 0) {
    const placeholders = allowedAgents.map(() => '?').join(',')
    db.prepare(`DELETE FROM qa_evaluations WHERE agent_name NOT IN (${placeholders})`).run(...allowedAgents)
    db.prepare(`DELETE FROM coaching_sessions WHERE agent_name NOT IN (${placeholders})`).run(...allowedAgents)
    db.prepare(`DELETE FROM pip_plans WHERE agent_name NOT IN (${placeholders})`).run(...allowedAgents)
    db.prepare(`DELETE FROM coaching_requests WHERE agent_name NOT IN (${placeholders})`).run(...allowedAgents)
    db.prepare(`DELETE FROM agents WHERE name NOT IN (${placeholders})`).run(...allowedAgents)
  }

  // Clean up any daily performance records with invalid date formats (e.g. MM/DD/YYYY)
  db.exec("DELETE FROM daily_performance WHERE date NOT LIKE '____-__-__'")
}

export interface UserPermissions {
  allowedLobs: ('VA' | 'SSD' | 'APPS')[]
  canManageDailyEntry: boolean
  canCopyEOD: boolean
  canViewQA: boolean
  canPerformQA: boolean
  canManageCoaching: boolean
  canViewTimeOff: boolean
  canApproveTimeOff: boolean
  canManageUsers: boolean
  canChangeSettings: boolean
}

export const DEFAULT_MASTER_PERMISSIONS: UserPermissions = {
  allowedLobs: ['VA', 'SSD', 'APPS'],
  canManageDailyEntry: true,
  canCopyEOD: true,
  canViewQA: true,
  canPerformQA: true,
  canManageCoaching: true,
  canViewTimeOff: true,
  canApproveTimeOff: true,
  canManageUsers: true,
  canChangeSettings: true,
}

export const DEFAULT_QA_PERMISSIONS: UserPermissions = {
  allowedLobs: ['VA', 'SSD', 'APPS'],
  canManageDailyEntry: false,
  canCopyEOD: true,
  canViewQA: true,
  canPerformQA: true,
  canManageCoaching: true,
  canViewTimeOff: true,
  canApproveTimeOff: false,
  canManageUsers: false,
  canChangeSettings: false,
}

export const DEFAULT_REGULAR_PERMISSIONS: UserPermissions = {
  allowedLobs: ['VA', 'SSD', 'APPS'],
  canManageDailyEntry: false,
  canCopyEOD: false,
  canViewQA: false,
  canPerformQA: false,
  canManageCoaching: false,
  canViewTimeOff: false,
  canApproveTimeOff: false,
  canManageUsers: false,
  canChangeSettings: false,
}

export function parseUserPermissions(role: string, permissionsJson?: string | null): UserPermissions {
  if (role === 'master' || role === 'superadmin') {
    return DEFAULT_MASTER_PERMISSIONS
  }
  if (role === 'qa') {
    return DEFAULT_QA_PERMISSIONS
  }
  if (role === 'regular') {
    return DEFAULT_REGULAR_PERMISSIONS
  }
  if (permissionsJson) {
    try {
      const parsed = JSON.parse(permissionsJson)
      return {
        allowedLobs: Array.isArray(parsed.allowedLobs) && parsed.allowedLobs.length > 0 ? parsed.allowedLobs : ['VA', 'SSD'],
        canManageDailyEntry: parsed.canManageDailyEntry !== undefined ? Boolean(parsed.canManageDailyEntry) : true,
        canCopyEOD: parsed.canCopyEOD !== undefined ? Boolean(parsed.canCopyEOD) : true,
        canViewQA: parsed.canViewQA !== undefined ? Boolean(parsed.canViewQA) : true,
        canPerformQA: parsed.canPerformQA !== undefined ? Boolean(parsed.canPerformQA) : true,
        canManageCoaching: parsed.canManageCoaching !== undefined ? Boolean(parsed.canManageCoaching) : true,
        canViewTimeOff: parsed.canViewTimeOff !== undefined ? Boolean(parsed.canViewTimeOff) : true,
        canApproveTimeOff: parsed.canApproveTimeOff !== undefined ? Boolean(parsed.canApproveTimeOff) : true,
        canManageUsers: Boolean(parsed.canManageUsers),
        canChangeSettings: Boolean(parsed.canChangeSettings),
      }
    } catch {
      // Fallback
    }
  }
  return {
    allowedLobs: ['VA', 'SSD'],
    canManageDailyEntry: true,
    canCopyEOD: true,
    canViewQA: true,
    canPerformQA: true,
    canManageCoaching: true,
    canViewTimeOff: true,
    canApproveTimeOff: true,
    canManageUsers: false,
    canChangeSettings: false,
  }
}

export default getDb
