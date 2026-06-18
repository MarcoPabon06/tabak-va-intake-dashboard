const fs = require('fs');
const path = require('path');

const targetDirs = [
  path.join(__dirname, '..', 'app'),
  path.join(__dirname, '..', 'components'),
];

const patterns = [
  /#6366f1/gi,
  /#8b5cf6/gi,
  /rgba\(99,\s*102,\s*241/gi,
];

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanDir(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      patterns.forEach(pat => {
        if (pat.test(content)) {
          console.log(`Match: ${fullPath} - Pattern: ${pat}`);
        }
      });
    }
  }
}

console.log('Scanning directories for hardcoded dashboard colors...');
targetDirs.forEach(scanDir);
console.log('Scan complete.');
