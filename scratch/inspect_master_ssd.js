const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = 'C:\\Users\\andre\\Downloads\\Master File -  SSD Intake (1).xlsx';
if (!fs.existsSync(filePath)) {
  console.log('File does not exist at:', filePath);
  process.exit(1);
}

const workbook = XLSX.readFile(filePath);
console.log('Sheet Names:', workbook.SheetNames);

workbook.SheetNames.forEach(sheetName => {
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`\n=== Sheet: ${sheetName} (Total Rows: ${rows.length}) ===`);
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    console.log(`Row ${i}:`, rows[i]);
  }
});
