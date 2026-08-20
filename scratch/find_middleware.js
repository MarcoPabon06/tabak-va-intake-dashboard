const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const files = fs.readdirSync(root)
console.log('Root files:', files.filter(f => f.includes('middleware') || f.includes('next')))
