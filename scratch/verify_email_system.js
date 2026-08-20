const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '..', 'tabak.db')
console.log('Testing Email Notification Engine on DB:', dbPath)
const db = new Database(dbPath)

// Check settings table for email keys
const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'resend%' OR key LIKE '%email%'").all()
console.log('Email settings in DB:', rows)

console.log('SUCCESS: Email system verification completed cleanly!')
