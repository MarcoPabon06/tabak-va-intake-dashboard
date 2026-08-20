const path = require('path')
const getDb = require('../lib/db').default
const db = getDb()
console.log('Database initialized and migrated successfully!')
