const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'C:\\Users\\andre\\Downloads\\Master File -  SSD Intake (1).xlsx';
const workbook = XLSX.readFile(filePath);

let targetSheet = workbook.SheetNames.find(n => 
  n.toLowerCase().includes('ssd') || 
  n.toLowerCase().includes('eod') || 
  n.toLowerCase().includes('tracker') || 
  n.toLowerCase().includes('leads')
) || workbook.SheetNames[0];

// If multiple sheets and first is a tiny config sheet, look for the sheet with the most rows
if (workbook.SheetNames.length > 1) {
  let maxRows = 0;
  let bestSheet = targetSheet;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    const rowCount = range.e.r - range.s.r + 1;
    if (rowCount > maxRows) {
      maxRows = rowCount;
      bestSheet = name;
    }
  }
  targetSheet = bestSheet;
}

console.log('Selected Sheet:', targetSheet);

const ws = workbook.Sheets[targetSheet];
const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log('Total Raw Rows:', rawRows.length);
console.log('Headers (Row 0):', rawRows[0]);

// Sample 10 rows
for (let i = 1; i <= 10; i++) {
  console.log(`Row ${i}:`, rawRows[i]);
}

// Let's check unique reps, statuses, claim types, reasonings in this file
const reps = new Set();
const statuses = new Set();
const claimTypes = new Set();
const reasonings = new Set();
let dateSamples = [];

for (let i = 1; i < rawRows.length; i++) {
  const row = rawRows[i];
  if (!row || !row[0]) continue;
  reps.add(String(row[0]).trim());
  if (row[4]) statuses.add(String(row[4]).trim());
  if (row[5]) claimTypes.add(String(row[5]).trim());
  if (row[6]) reasonings.add(String(row[6]).trim());
  if (dateSamples.length < 5 && row[3]) dateSamples.push(row[3]);
}

console.log('\n--- UNIQUE REPS ---');
console.log(Array.from(reps));

console.log('\n--- UNIQUE STATUSES ---');
console.log(Array.from(statuses));

console.log('\n--- UNIQUE CLAIM TYPES ---');
console.log(Array.from(claimTypes));

console.log('\n--- UNIQUE REASONINGS ---');
console.log(Array.from(reasonings));

console.log('\n--- DATE SAMPLES ---');
console.log(dateSamples);
