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
        if (line.includes('redirect(') || line.includes('router.push(') || line.includes('router.replace(') || line.includes('location.href')) {
          results.push(`${filePath}:${idx + 1}: ${line.trim()}`)
        }
      })
    }
  })
  return results
}

const root = path.join(__dirname, '..')
const appDir = path.join(root, 'app')

console.log('--- Redirects in app/ ---')
walk(appDir).forEach(r => console.log(r))
