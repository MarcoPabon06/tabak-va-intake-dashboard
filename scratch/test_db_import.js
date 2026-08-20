const Database = require('better-sqlite3');
const path = require('path');
const XLSX = require('xlsx');

const dbPath = path.resolve('./tabak.db');
const db = new Database(dbPath);

const filePath = 'C:\\Users\\andre\\Downloads\\Master File -  SSD Intake (1).xlsx';
const workbook = XLSX.readFile(filePath);

let targetSheet = workbook.SheetNames.find(n => {
  const lower = n.toLowerCase();
  return lower.includes('ssd') || lower.includes('eod') || lower.includes('tracker') || lower.includes('leads');
}) || workbook.SheetNames[0];

if (workbook.SheetNames.length > 1) {
  let maxRows = 0;
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    if (ws && ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      const rowCount = range.e.r - range.s.r + 1;
      if (rowCount > maxRows) {
        maxRows = rowCount;
        targetSheet = name;
      }
    }
  }
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
  if (norm.includes('resched') || norm.includes('appointment')) return 'Appointment Rescheduled';
  if (norm.includes('paper') && norm.includes('retainer')) return 'Paper Retainer Sent';
  if (norm.includes('signed') || norm.includes('signed e-sign')) return 'Signed E-Sign';
  if (norm.includes('sent e-sign') || norm.includes('sent esign') || norm.includes('sent e-sing') || norm.includes('e-sign sent')) return 'Sent E-Sign';
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

function normalizeOutcomeReason(raw) {
  if (!raw) return null;
  const norm = String(raw).trim().toLowerCase();
  if (norm.includes('already') && (norm.includes('represented') || norm.includes('representation') || norm.includes('has representation'))) return 'Already Represented';
  if (norm.includes('earning more') || norm.includes('more than allowed') || norm.includes('earning') || norm.includes('leading is more')) return 'Leading is more than allowed';
  if (norm.includes('not sufficiently disabled') || norm.includes('sufficiently disabled') || norm.includes('not disabled')) return 'Not sufficiently disabled';
  if (norm.includes('working full time') || norm.includes('full time') || norm.includes('working over')) return 'Lead is working full time';
  if (norm.includes('not interested') || norm.includes('uninterested') || norm.includes('removed from')) return 'Not interested';
  if (norm.includes('other') || norm.length > 0) return 'Other';
  return 'Other';
}

// Find header row
let headerIdx = 0;
for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
  const row = rawRows[i];
  if (Array.isArray(row)) {
    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('rep') || rowStr.includes('client') || rowStr.includes('lead') || rowStr.includes('status')) {
      headerIdx = i;
      break;
    }
  }
}

const headerRow = (rawRows[headerIdx] || []).map(h => String(h || '').trim().toLowerCase());

let iRep = headerRow.findIndex(h => h.includes('rep') || h.includes('agent') || h.includes('specialist') || h.includes('asesor'));
let iClient = headerRow.findIndex(h => (h.includes('lead') && h.includes('name')) || h.includes('client') || (h.includes('name') && !h.includes('rep')));
let iLeadId = headerRow.findIndex(h => h.includes('lead no') || h.includes('lead #') || h.includes('lead id') || h.includes('leadid') || h.includes('id') || h.includes('case'));
let iDate = headerRow.findIndex(h => h.includes('date') || h.includes('fecha'));
let iStatus = headerRow.findIndex(h => h.includes('status') || h.includes('estado'));
let iClaimType = headerRow.findIndex(h => h.includes('claim') || h.includes('type'));
let iReason = headerRow.findIndex(h => h.includes('reasoning') || h.includes('reason') || h.includes('outcome') || h.includes('motivo'));
let iOtherNotes = headerRow.findIndex(h => h.includes('other') || h.includes('note') || h.includes('comment') || h.includes('detail') || h.includes('detalles'));

if (iRep === -1) iRep = 0;
if (iClient === -1) iClient = 1;
if (iLeadId === -1) iLeadId = 2;
if (iDate === -1) iDate = 3;
if (iStatus === -1) iStatus = 4;
if (iClaimType === -1) iClaimType = 5;
if (iReason === -1) iReason = 6;
if (iOtherNotes === -1) iOtherNotes = 7;

const dataRows = rawRows.slice(headerIdx + 1);

const insertStmt = db.prepare(`
  INSERT INTO ssd_lead_records (
    rep_name, rep_username, client_name, lead_id, date, status, claim_type, outcome_reason, other_reason_notes, signed_at, last_edited_by
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

let imported = 0;
let skipped = 0;

const importAll = db.transaction(() => {
  for (const row of dataRows) {
    if (!row || !Array.isArray(row) || row.length === 0) continue;

    let clientName = row[iClient] ? String(row[iClient]).trim() : '';
    const repName = row[iRep] ? String(row[iRep]).trim() : '';
    const leadId = row[iLeadId] ? String(row[iLeadId]).trim() : null;

    if (!clientName && !repName && !leadId) {
      skipped++;
      continue;
    }

    if (!clientName) {
      clientName = leadId ? `Lead #${leadId}` : 'Unnamed Client';
    }

    const finalRepName = repName || 'SSD Specialist';
    const repUsername = finalRepName.toLowerCase().replace(/[^a-z0-9]/g, '');

    const dateStr = parseDateString(row[iDate]);
    const rawStatus = row[iStatus] ? String(row[iStatus]).trim() : 'Sent E-Sign';
    const status = normalizeStatus(rawStatus);

    const rawClaim = row[iClaimType] ? String(row[iClaimType]).trim() : '';
    const claimType = normalizeClaimType(rawClaim);

    const rawReason = row[iReason] ? String(row[iReason]).trim() : '';
    const rawOther = row[iOtherNotes] ? String(row[iOtherNotes]).trim() : '';
    const outcomeReason = normalizeOutcomeReason(rawReason || rawOther);

    let otherNotes = rawOther || (rawReason && outcomeReason === 'Other' ? rawReason : null);
    const signedAt = status === 'Signed E-Sign' ? `${dateStr} 12:00:00` : null;

    insertStmt.run(
      finalRepName,
      repUsername,
      clientName,
      leadId,
      dateStr,
      status,
      claimType,
      outcomeReason,
      otherNotes,
      signedAt,
      'Test Import'
    );
    imported++;
  }
});

importAll();
console.log(`Successfully imported ${imported} records! (Skipped ${skipped} empty rows)`);
const totalCount = db.prepare('SELECT count(*) as count FROM ssd_lead_records').get();
console.log('Total ssd_lead_records in DB:', totalCount.count);
