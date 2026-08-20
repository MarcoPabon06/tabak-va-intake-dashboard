const fs = require('fs')
const path = require('path')

function walk(dir, results = []) {
  const list = fs.readdirSync(dir)
  list.forEach(file => {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat && stat.isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.next')) {
        walk(filePath, results)
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(filePath, 'utf8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        if (line.includes('dashboard') || line.includes('redirect')) {
          results.push(`${filePath}:${idx + 1}: ${line.trim()}`)
        }
      })
    }
  })
  return results
}

const root = path.join(__dirname, '..')
const appDir = path.join(root, 'app')
const compDir = path.join(root, 'components')

console.log('--- Occurrences of dashboard or redirect in app/ and components/ ---')
walk(appDir).forEach(r => console.log(r))
walk(compDir).forEach(r => console.log(r))
