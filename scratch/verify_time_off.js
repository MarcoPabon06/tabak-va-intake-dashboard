const Database = require('better-sqlite3')
const path = require('path')

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'tabak.db')

console.log('Connecting to database at:', DB_PATH)
const db = new Database(DB_PATH)

// Test Helper
function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message)
    process.exit(1)
  }
  console.log('✅ PASS:', message)
}

try {
  // Ensure the table exists for testing
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_off_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      lob TEXT NOT NULL CHECK(lob IN ('VA', 'SSD')),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Rejected')),
      reviewed_by TEXT,
      reviewed_at TEXT,
      manager_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(username) REFERENCES users(username)
    );
    CREATE INDEX IF NOT EXISTS idx_timeoff_dates ON time_off_requests(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_timeoff_lob ON time_off_requests(lob);
    CREATE INDEX IF NOT EXISTS idx_timeoff_status ON time_off_requests(status);
  `)

  // Test 1: Check table existence
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='time_off_requests'").get()
  assert(tables !== undefined, 'time_off_requests table exists in database')

  // Clean up any old test records
  db.prepare("DELETE FROM time_off_requests WHERE username LIKE '%_test'").run()
  db.prepare("DELETE FROM users WHERE username LIKE '%_test'").run()

  // Setup test users
  db.prepare(`
    INSERT INTO users (username, password_hash, role, display_name, lob, active) 
    VALUES ('agent1_test', 'hash', 'regular', 'Agent 1 Test', 'VA', 1)
  `).run()
  db.prepare(`
    INSERT INTO users (username, password_hash, role, display_name, lob, active) 
    VALUES ('agent2_test', 'hash', 'regular', 'Agent 2 Test', 'VA', 1)
  `).run()
  db.prepare(`
    INSERT INTO users (username, password_hash, role, display_name, lob, active) 
    VALUES ('agent3_test', 'hash', 'regular', 'Agent 3 Test', 'SSD', 1)
  `).run()

  // Test 2: Insert first request
  const stmtInsert = db.prepare(`
    INSERT INTO time_off_requests (username, agent_name, lob, start_date, end_date, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'Pending')
  `)
  const res1 = stmtInsert.run('agent1_test', 'Agent 1 Test', 'VA', '2026-06-25', '2026-06-27', 'Family vacation')
  assert(res1.changes === 1, 'Successfully inserted pending request for Agent 1 Test')

  const requestId = res1.lastInsertRowid

  // Test 3: Overlap check logic
  // Helper to check overlap
  const checkOverlap = (username, start, end) => {
    const overlap = db.prepare(`
      SELECT count(*) as count 
      FROM time_off_requests 
      WHERE username = ? 
        AND status IN ('Pending', 'Approved') 
        AND (start_date <= ? AND end_date >= ?)
    `).get(username, end, start)
    return overlap.count > 0
  }

  // Request completely inside range: 2026-06-26 to 2026-06-26
  assert(checkOverlap('agent1_test', '2026-06-26', '2026-06-26') === true, 'Overlapping check succeeds for sub-range')

  // Request starting before and ending during range: 2026-06-24 to 2026-06-25
  assert(checkOverlap('agent1_test', '2026-06-24', '2026-06-25') === true, 'Overlapping check succeeds for left-overlap')

  // Request starting during and ending after range: 2026-06-27 to 2026-06-29
  assert(checkOverlap('agent1_test', '2026-06-27', '2026-06-29') === true, 'Overlapping check succeeds for right-overlap')

  // Request completely outside range: 2026-06-20 to 2026-06-24
  assert(checkOverlap('agent1_test', '2026-06-20', '2026-06-24') === false, 'Overlapping check reports no overlap for separate early range')

  // Request completely outside range: 2026-06-28 to 2026-07-02
  assert(checkOverlap('agent1_test', '2026-06-28', '2026-07-02') === false, 'Overlapping check reports no overlap for separate late range')

  // Different user check: agent2_test has no overlap
  assert(checkOverlap('agent2_test', '2026-06-26', '2026-06-26') === false, 'Other user (Agent 2 Test) has no overlap on same dates')

  // Test 4: Approval state transition
  const stmtUpdate = db.prepare(`
    UPDATE time_off_requests 
    SET status = 'Approved', reviewed_by = 'manager_test', reviewed_at = datetime('now'), manager_notes = 'Approved based on coverage'
    WHERE id = ?
  `)
  const res2 = stmtUpdate.run(requestId)
  assert(res2.changes === 1, 'Successfully updated request status to Approved')

  const updatedReq = db.prepare('SELECT status, reviewed_by, manager_notes FROM time_off_requests WHERE id = ?').get(requestId)
  assert(updatedReq.status === 'Approved', 'Status field is Approved')
  assert(updatedReq.reviewed_by === 'manager_test', 'Reviewed by manager_test')
  assert(updatedReq.manager_notes === 'Approved based on coverage', 'Manager notes match')

  // Test 5: Coverage Calculations simulation
  // Active regular users on VA division = 2 (agent1_test, agent2_test)
  // Active regular users on SSD division = 1 (agent3_test)
  // Approved time off on 2026-06-26: agent1_test (VA) is off.
  
  const getDailyCoverage = (dateStr, lob) => {
    // 1. Fetch total active count
    const totalActive = db.prepare("SELECT count(*) as count FROM users WHERE role = 'regular' AND active = 1 AND lob = ?").get(lob).count
    
    // 2. Fetch approved off count
    const approvedOff = db.prepare(`
      SELECT count(*) as count 
      FROM time_off_requests 
      WHERE lob = ? 
        AND status = 'Approved' 
        AND start_date <= ? 
        AND end_date >= ?
    `).get(lob, dateStr, dateStr).count

    const working = totalActive - approvedOff
    const percentage = totalActive > 0 ? (working / totalActive) * 100 : 100

    return { total: totalActive, off: approvedOff, working, percentage }
  }

  // Coverage for VA on 2026-06-26: agent1_test is off, others are working.
  const covVA = getDailyCoverage('2026-06-26', 'VA')
  assert(covVA.total >= 2, 'Total active VA agents is at least 2')
  assert(covVA.off === 1, 'VA agents off on 2026-06-26 is exactly 1')
  assert(covVA.working === covVA.total - 1, 'VA agents working is total - 1')
  assert(covVA.percentage === ((covVA.total - 1) / covVA.total) * 100, 'VA coverage percentage matches')

  // Coverage for SSD on 2026-06-26: agent3_test is working.
  const covSSD = getDailyCoverage('2026-06-26', 'SSD')
  assert(covSSD.total >= 1, 'Total active SSD agents is at least 1')
  assert(covSSD.off === 0, 'SSD agents off on 2026-06-26 is exactly 0')
  assert(covSSD.working === covSSD.total, 'SSD agents working is equal to total active')
  assert(covSSD.percentage === 100, 'SSD coverage percentage on 2026-06-26 is 100%')

  // Clean up test records
  db.prepare("DELETE FROM time_off_requests WHERE username LIKE '%_test'").run()
  db.prepare("DELETE FROM users WHERE username LIKE '%_test'").run()
  console.log('🧹 Database test records cleaned up.')

  console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉')

} catch (err) {
  console.error('❌ CRITICAL ERROR IN VERIFICATION:', err)
  // Attempt cleanup on error
  try {
    db.prepare("DELETE FROM time_off_requests WHERE username LIKE '%_test'").run()
    db.prepare("DELETE FROM users WHERE username LIKE '%_test'").run()
  } catch (e) {}
  process.exit(1)
}
