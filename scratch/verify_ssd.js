const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve('./tabak.db');
const db = new Database(dbPath);

console.log('--- TABLES IN DB ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.name));

console.log('--- SSD USERS & AGENTS ---');
const ssdUsers = db.prepare("SELECT username, display_name, role, lob, active FROM users WHERE lob = 'SSD'").all();
console.log('SSD Users:', ssdUsers);

const ssdAgents = db.prepare("SELECT name, lob, active FROM agents WHERE lob = 'SSD'").all();
console.log('SSD Agents:', ssdAgents);
