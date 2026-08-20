const XLSX = require('xlsx');
const fs = require('fs');

const filePath = 'C:\\Users\\andre\\Downloads\\Master File -  SSD Intake (1).xlsx';
const workbook = XLSX.readFile(filePath);

// Smart Sheet Finder
let targetSheet = workbook.SheetNames.find(n => 
  n.toLowerCase().includes('ssd') || 
  n.toLowerCase().includes('eod') || 
  n.toLowerCase().includes('tracker') || 
  n.toLowerCase().includes('leads')
) || workbook.SheetNames[0];

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

function parseDateString(dateVal) {
  if (!dateVal) return new Date().toISOString().split('T')[0];
  if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
  if (typeof dateVal === 'number') {
    const d = XLSX.SSF.parse_date_code(dateVal);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const str = String(dateVal).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return new Date().toISOString().split('T')[0];
}

function normalizeStatus(raw) {
  if (!raw) return 'Sent E-Sign';
  const norm = String(raw).trim().toLowerCase();
  if (norm.includes('paper') && norm.includes('retainer')) return 'Paper Retainer Sent';
  if (norm.includes('signed') || norm.includes('signed e-sign')) return 'Signed E-Sign';
  if (norm.includes('sent e-sign') || norm.includes('sent esign') || norm.includes('sent e-sing') || norm.includes('e-sign sent')) return 'Sent E-Sign';
  if (norm.includes('reschedule') || norm.includes('appointment')) return 'Appointment Rescheduled';
  if (norm.includes('refuse') || norm.includes('crh') || norm.includes('client refused')) return 'Client Refused Help';
  if (norm.includes('reject') || norm.includes('case rejected') || norm.includes('not sufficiently disabled')) return 'Case Rejected';
  if (norm.includes('rfc') || norm.includes('sent rfc')) return 'Sent RFC';
  return 'Sent E-Sign';
}

function normalizeClaimType(raw) {
  if (!raw) return null;
  const norm = String(raw).trim().toLowerCase();
  if (norm.includes('ssdi') && norm.includes('ssi')) return 'SSDI+SSI';
  if (norm.includes('ssdi')) return 'SSDI Only';
  if (norm.includes('ssi')) return 'SSI Only';
  if (norm.includes('dwb')) return 'DWB';
  return null;
}

function normalizeOutcomeReason(raw, rawOther) {
  const norm = (raw ? String(raw).trim().toLowerCase() : '');
  const otherNorm = (rawOther ? String(rawOther).trim().toLowerCase() : '');
  const combined = `${norm} ${otherNorm}`;

  if (combined.includes('already') && (combined.includes('represented') || combined.includes('representation') || combined.includes('has representation'))) return 'Already Represented';
  if (combined.includes('earning more') || combined.includes('more than allowed') || combined.includes('earning')) return 'Leading is more than allowed';
  if (combined.includes('not sufficiently disabled') || combined.includes('sufficiently disabled') || combined.includes('not disabled')) return 'Not sufficiently disabled';
  if (combined.includes('working full time') || combined.includes('full time') || combined.includes('working over')) return 'Lead is working full time';
  if (combined.includes('not interested') || combined.includes('uninterested') || combined.includes('removed from')) return 'Not interested';
  if (norm.includes('other') || otherNorm.length > 0) return 'Other';

  return null;
}

const headerRow = rawRows[0].map(h => String(h || '').trim().toLowerCase());
console.log('Headers:', headerRow);

let iRep = headerRow.findIndex(h => h.includes('rep') || h.includes('agent') || h.includes('specialist'));
let iClient = headerRow.findIndex(h => (h.includes('lead') && h.includes('name')) || h.includes('client') || (h.includes('name') && !h.includes('rep')));
let iLeadId = headerRow.findIndex(h => h.includes('lead no') || h.includes('lead #') || h.includes('leadid') || h.includes('lead id') || h.includes('id') || h.includes('lead'));
let iDate = headerRow.findIndex(h => h.includes('date'));
let iStatus = headerRow.findIndex(h => h.includes('status'));
let iClaimType = headerRow.findIndex(h => h.includes('claim') || h.includes('type'));
let iReason = headerRow.findIndex(h => h.includes('reasoning') || h.includes('reason') || h.includes('outcome'));
let iOtherNotes = headerRow.findIndex(h => h.includes('other') || h.includes('note') || h.includes('comment') || h.includes('detail'));

console.log('Indices:', { iRep, iClient, iLeadId, iDate, iStatus, iClaimType, iReason, iOtherNotes });

const dataRows = rawRows.slice(1);
let validCount = 0;
let skippedCount = 0;
const statusCounts = {};
const claimCounts = {};
const reasonCounts = {};
const repCounts = {};

for (const row of dataRows) {
  if (!row || row.length === 0) {
    skippedCount++;
    continue;
  }
  const clientName = row[iClient] ? String(row[iClient]).trim() : '';
  const repName = row[iRep] ? String(row[iRep]).trim() : '';

  if (!clientName && !repName) {
    skippedCount++;
    continue;
  }

  const finalClientName = clientName || 'Unnamed Client';
  const finalRepName = repName || 'SSD Specialist';
  const leadId = row[iLeadId] ? String(row[iLeadId]).trim() : null;
  const dateStr = parseDateString(row[iDate]);
  const status = normalizeStatus(row[iStatus]);
  const claimType = normalizeClaimType(row[iClaimType]);
  const outcomeReason = normalizeOutcomeReason(row[iReason], row[iOtherNotes]);
  const otherNotes = row[iOtherNotes] ? String(row[iOtherNotes]).trim() : (row[iReason] && outcomeReason === 'Other' ? String(row[iReason]).trim() : null);

  validCount++;
  statusCounts[status] = (statusCounts[status] || 0) + 1;
  if (claimType) claimCounts[claimType] = (claimCounts[claimType] || 0) + 1;
  if (outcomeReason) reasonCounts[outcomeReason] = (reasonCounts[outcomeReason] || 0) + 1;
  repCounts[finalRepName] = (repCounts[finalRepName] || 0) + 1;
}

console.log(`\nProcessed ${validCount} valid lead rows (skipped ${skippedCount} empty rows).`);
console.log('\nStatus Distribution:', statusCounts);
console.log('\nClaim Types Distribution:', claimCounts);
console.log('\nOutcome Reasons Distribution:', reasonCounts);
console.log('\nRepresentative Counts:', repCounts);
