const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'app/coaching/page.tsx',
  'app/entry/page.tsx',
  'app/import/page.tsx',
  'app/login/page.tsx',
  'app/qa/page.tsx',
  'app/qa-entry/page.tsx',
  'app/settings/page.tsx',
  'app/time-off/page.tsx',
  'app/users/page.tsx',
  'components/BadgeShelf.tsx',
  'components/charts/CAPDBarChart.tsx',
  'components/charts/ConversionChart.tsx',
  'components/charts/PerformanceLineChart.tsx',
  'components/charts/WeekdayHeatmap.tsx',
  'components/NotificationBell.tsx',
  'components/PersonalDashboard.tsx',
  'components/SummaryCards.tsx',
];

const replacements = [
  // 1. Indigo hex -> Crimson Red
  { search: /#6366f1/gi, replace: '#b82105' },
  // 2. Purple hex -> Slate Blue
  { search: /#8b5cf6/gi, replace: '#5f758e' },
  // 3. Indigo RGBA -> Crimson RGBA
  { search: /rgba\(99,\s*102,\s*241,\s*([\d.]+)\)/gi, replace: 'rgba(184, 33, 5, $1)' },
  // 4. Purple RGBA -> Slate Blue RGBA
  { search: /rgba\(139,\s*92,\s*246,\s*([\d.]+)\)/gi, replace: 'rgba(95, 117, 142, $1)' },
];

const workspaceRoot = path.join(__dirname, '..');

console.log('🚀 Running automated rebranding replacements...');

filesToUpdate.forEach(relPath => {
  const fullPath = path.join(workspaceRoot, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️  File not found: ${relPath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  let originalContent = content;

  replacements.forEach(rep => {
    content = content.replace(rep.search, rep.replace);
  });

  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Updated: ${relPath}`);
  } else {
    console.log(`ℹ️  No changes needed for: ${relPath}`);
  }
});

console.log('🎉 Rebranding replacements completed!');
