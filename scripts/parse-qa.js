// Quick script to parse the QA Evaluation Excel and dump the structure
const XLSX = require('xlsx')
const path = require('path')

const wb = XLSX.readFile(path.join('C:\\Users\\andre\\Downloads', 'QA Evaluation.xlsx'))

// QA Matrix sheet
const ws = wb.Sheets['QA Matrix']
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

console.log('=== QA Matrix — First 20 rows ===')
for (let i = 0; i < Math.min(20, data.length); i++) {
  const row = data[i].map((c, ci) => `[${ci}]${c}`).filter(c => c !== `[${c.split(']')[0].slice(1)}]`)
  if (row.some(r => r.split(']')[1])) console.log(`Row ${i}: ${row.join(' | ')}`)
}

console.log('\n=== EV Lookup — All rows ===')
const ws2 = wb.Sheets['EV Lookup']
const data2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' })
for (let i = 0; i < data2.length; i++) {
  const row = data2[i]
  if (row.some(c => c !== '')) {
    console.log(`Row ${i}:`, JSON.stringify(row))
  }
}
