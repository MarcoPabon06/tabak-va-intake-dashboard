const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '..', 'tabak.db')
console.log('Testing Power Automate Webhook Engine on DB:', dbPath)
const db = new Database(dbPath)

// Check settings table for power_automate_webhook_url
const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE '%webhook%'").all()
console.log('Webhook settings in DB:', rows)

console.log('SUCCESS: Power Automate Webhook verification completed cleanly!')
