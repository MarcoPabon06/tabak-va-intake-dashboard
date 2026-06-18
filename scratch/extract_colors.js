const fs = require('fs');
const path = require('path');

const contentPath = 'C:\\Users\\andre\\.gemini\\antigravity\\brain\\2424060f-2e4d-4723-940e-67e7971c88dd\\.system_generated\\steps\\2199\\content.md';

if (!fs.existsSync(contentPath)) {
  console.log('Content file not found at:', contentPath);
  process.exit(1);
}

const html = fs.readFileSync(contentPath, 'utf8');

// Search for colors (hex codes)
const hexMatches = html.match(/#[0-9a-fA-F]{6}\b/g) || [];
const uniqueHex = [...new Set(hexMatches.map(h => h.toLowerCase()))];

console.log('--- FOUND HEX COLORS ---');
console.log(uniqueHex.slice(0, 30));

// Search for background-color, color, fill in css or styles
const cssVars = html.match(/--global-[a-zA-Z0-9_-]+:\s*[^;}]+/g) || [];
console.log('\n--- FOUND GLOBAL CSS VARIABLES ---');
console.log([...new Set(cssVars)].slice(0, 30));

// Search for style colors
const inlineColors = html.match(/color:\s*[^;"]+/g) || [];
console.log('\n--- INLINE COLOR SAMPLES ---');
console.log([...new Set(inlineColors)].slice(0, 15));

// Find fonts used
const fontMatches = html.match(/font-family:[^;}]+/g) || [];
console.log('\n--- FONTS USED ---');
console.log([...new Set(fontMatches)].slice(0, 10));

// Find logo image URLs
const logoMatches = html.match(/src="[^"]+logo[^"]+"/gi) || [];
console.log('\n--- LOGO IMAGE CANDIDATES ---');
console.log([...new Set(logoMatches)].slice(0, 5));
