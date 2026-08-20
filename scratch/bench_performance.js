const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.resolve('./tabak.db'));

console.log('Total ssd_lead_records in DB:', db.prepare('SELECT count(*) as c FROM ssd_lead_records').get().c);

// Benchmark 1: Current unoptimized approach (SELECT * + JS filter)
console.time('Unoptimized in-memory aggregation');
const allRows = db.prepare("SELECT * FROM ssd_lead_records WHERE date >= '2026-01-01' AND date <= '2026-12-31'").all();
const signed = allRows.filter(r => r.status === 'Signed E-Sign').length;
const pending = allRows.filter(r => r.status === 'Sent E-Sign' || r.status === 'Paper Retainer Sent').length;
const crh = allRows.filter(r => r.status === 'Client Refused Help').length;
const rejected = allRows.filter(r => r.status === 'Case Rejected').length;
const rfc = allRows.filter(r => r.status === 'Sent RFC').length;
console.timeEnd('Unoptimized in-memory aggregation');
console.log('Results:', { total: allRows.length, signed, pending, crh, rejected, rfc });

// Benchmark 2: Optimized SQL Aggregation
console.time('Optimized SQL aggregation');
const metrics = db.prepare(`
  SELECT 
    COUNT(*) as total_leads,
    SUM(CASE WHEN status = 'Sent E-Sign' THEN 1 ELSE 0 END) as sent_esigns,
    SUM(CASE WHEN status = 'Paper Retainer Sent' THEN 1 ELSE 0 END) as paper_sent,
    SUM(CASE WHEN status = 'Signed E-Sign' THEN 1 ELSE 0 END) as signed_esigns,
    SUM(CASE WHEN status = 'Sent RFC' THEN 1 ELSE 0 END) as sent_rfc,
    SUM(CASE WHEN status = 'Appointment Rescheduled' THEN 1 ELSE 0 END) as rescheduled,
    SUM(CASE WHEN status = 'Client Refused Help' THEN 1 ELSE 0 END) as crh_count,
    SUM(CASE WHEN status = 'Case Rejected' THEN 1 ELSE 0 END) as rejected_count,
    SUM(CASE WHEN is_converted = 1 THEN 1 ELSE 0 END) as converted_count
  FROM ssd_lead_records
  WHERE date >= '2026-01-01' AND date <= '2026-12-31'
`).get();
console.timeEnd('Optimized SQL aggregation');
console.log('Optimized Metrics:', metrics);
