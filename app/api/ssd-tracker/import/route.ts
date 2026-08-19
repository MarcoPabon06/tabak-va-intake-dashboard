import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'
import { isAuthorizedSsdTeamLead, SSD_STATUS_OPTIONS, SSD_CLAIM_TYPES, SSD_OUTCOME_REASONS } from '../route'
import { validateFileUpload, sanitizeCellText, maskSensitivePII, recordUploadAudit } from '@/lib/security'

function parseDateString(dateVal: any): string {
  if (!dateVal) return new Date().toISOString().split('T')[0]
  if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0]
  if (typeof dateVal === 'number') {
    const d = XLSX.SSF.parse_date_code(dateVal)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(dateVal).trim()
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }
  // Try MM/DD/YYYY
  const parts = str.split(/[-/]/)
  if (parts.length === 3) {
    let year = parts[2]
    if (year.length === 2) year = '20' + year
    return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  }
  return new Date().toISOString().split('T')[0]
}

function normalizeStatus(raw: string): string {
  const norm = raw.trim().toLowerCase()
  if (norm.includes('resched') || norm.includes('appointment')) return 'Appointment Rescheduled'
  if (norm.includes('paper') && norm.includes('retainer')) return 'Paper Retainer Sent'
  if (norm.includes('signed') || norm.includes('signed e-sign')) return 'Signed E-Sign'
  if (norm.includes('sent e-sign') || norm.includes('sent esign') || norm.includes('sent e-sing') || norm.includes('e-sign sent')) return 'Sent E-Sign'
  if (norm.includes('refuse') || norm.includes('crh') || norm.includes('client refused')) return 'Client Refused Help'
  if (norm.includes('reject') || norm.includes('case rejected') || norm.includes('not sufficiently disabled')) return 'Case Rejected'
  if (norm.includes('rfc') || norm.includes('sent rfc')) return 'Sent RFC'

  // Exact match fallback
  const exact = SSD_STATUS_OPTIONS.find((s) => s.toLowerCase() === norm)
  return exact || 'Sent E-Sign'
}

function normalizeClaimType(raw: string): string | null {
  if (!raw) return null
  const norm = raw.trim().toLowerCase()
  if (norm.includes('ssdi') && norm.includes('ssi')) return 'SSDI+SSI'
  if (norm.includes('ssdi')) return 'SSDI Only'
  if (norm.includes('ssi')) return 'SSI Only'
  if (norm.includes('dwb')) return 'DWB'

  const exact = SSD_CLAIM_TYPES.find((c) => c.toLowerCase() === norm)
  return exact || null
}

function normalizeOutcomeReason(raw: string): string | null {
  if (!raw) return null
  const norm = raw.trim().toLowerCase()
  if (norm.includes('already') && (norm.includes('represented') || norm.includes('representation') || norm.includes('has representation'))) return 'Already Represented'
  if (norm.includes('earning more') || norm.includes('more than allowed') || norm.includes('earning') || norm.includes('leading is more')) return 'Leading is more than allowed'
  if (norm.includes('not sufficiently disabled') || norm.includes('sufficiently disabled') || norm.includes('not disabled')) return 'Not sufficiently disabled'
  if (norm.includes('working full time') || norm.includes('full time') || norm.includes('working over')) return 'Lead is working full time'
  if (norm.includes('not interested') || norm.includes('uninterested') || norm.includes('removed from')) return 'Not interested'
  if (norm.includes('other') || norm.length > 0) return 'Other'

  const exact = SSD_OUTCOME_REASONS.find((r) => r.toLowerCase() === norm)
  return exact || 'Other'
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAuthorizedSsdTeamLead(session)) {
    return NextResponse.json({ error: 'Forbidden: Only SSD Team Leads and Admins can import spreadsheet leads' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'user'
  const sessionDisplayName = session.user?.name || sessionUsername
  const userId = (session.user as any)?.id || null

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Security Suite Validation
  const validation = validateFileUpload(buffer, file.name, { allowedTypes: ['xlsx', 'xls'] })
  if (!validation.isValid) {
    recordUploadAudit({
      userId,
      username: sessionUsername,
      userName: sessionDisplayName,
      uploadType: 'ssd_leads',
      filename: file.name,
      buffer,
      rowsProcessed: 0,
      status: 'REJECTED',
      details: validation.error,
    })
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' })
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to parse Excel file: ${err.message}` }, { status: 400 })
  }

  // Smart Sheet Finder: find sheet containing 'ssd', 'eod', 'tracker', 'leads', or the sheet with the most rows
  let targetSheet = workbook.SheetNames.find(n => {
    const lower = n.toLowerCase()
    return lower.includes('ssd') || lower.includes('eod') || lower.includes('tracker') || lower.includes('leads')
  }) || workbook.SheetNames[0]

  if (workbook.SheetNames.length > 1) {
    let maxRows = 0
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name]
      if (ws && ws['!ref']) {
        const range = XLSX.utils.decode_range(ws['!ref'])
        const rowCount = range.e.r - range.s.r + 1
        if (rowCount > maxRows) {
          maxRows = rowCount
          targetSheet = name
        }
      }
    }
  }

  const worksheet = workbook.Sheets[targetSheet]
  if (!worksheet) {
    return NextResponse.json({ error: 'No valid sheet found in Excel workbook' }, { status: 400 })
  }

  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 })
  if (rawRows.length < 2) {
    return NextResponse.json({ error: `Selected sheet "${targetSheet}" is empty or missing data rows` }, { status: 400 })
  }

  // Find header row (check first 10 rows)
  let headerIdx = 0
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const row = rawRows[i]
    if (Array.isArray(row)) {
      const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ')
      if (rowStr.includes('rep') || rowStr.includes('client') || rowStr.includes('lead') || rowStr.includes('status')) {
        headerIdx = i
        break
      }
    }
  }

  const headerRow = (rawRows[headerIdx] || []).map((h: any) => String(h || '').trim().toLowerCase())

  // Find column indices
  let iRep = headerRow.findIndex((h: string) => h.includes('rep') || h.includes('agent') || h.includes('specialist') || h.includes('asesor'))
  let iClient = headerRow.findIndex((h: string) => (h.includes('lead') && h.includes('name')) || h.includes('client') || (h.includes('name') && !h.includes('rep')))
  let iLeadId = headerRow.findIndex((h: string) => h.includes('lead no') || h.includes('lead #') || h.includes('lead id') || h.includes('leadid') || h.includes('id') || h.includes('case'))
  let iDate = headerRow.findIndex((h: string) => h.includes('date') || h.includes('fecha'))
  let iStatus = headerRow.findIndex((h: string) => h.includes('status') || h.includes('estado'))
  let iClaimType = headerRow.findIndex((h: string) => h.includes('claim') || h.includes('type'))
  let iReason = headerRow.findIndex((h: string) => h.includes('reasoning') || h.includes('reason') || h.includes('outcome') || h.includes('motivo'))
  let iOtherNotes = headerRow.findIndex((h: string) => h.includes('other') || h.includes('note') || h.includes('comment') || h.includes('detail') || h.includes('detalles'))

  // Fallback to sequential standard 8-column layout if headers not fully identified
  if (iRep === -1) iRep = 0
  if (iClient === -1) iClient = 1
  if (iLeadId === -1) iLeadId = 2
  if (iDate === -1) iDate = 3
  if (iStatus === -1) iStatus = 4
  if (iClaimType === -1) iClaimType = 5
  if (iReason === -1) iReason = 6
  if (iOtherNotes === -1) iOtherNotes = 7

  const dataRows = rawRows.slice(headerIdx + 1)
  const db = getDb()

  const batchId = `batch_ssd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  const snapshotList: any[] = []
  let imported = 0
  let skipped = 0
  let updated = 0

  const insertStmt = db.prepare(`
    INSERT INTO ssd_lead_records (
      rep_name, rep_username, client_name, lead_id, date, status, claim_type, outcome_reason, other_reason_notes, signed_at, import_batch_id, last_edited_by
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `)

  const updateStmt = db.prepare(`
    UPDATE ssd_lead_records SET
      rep_name = ?,
      rep_username = ?,
      client_name = ?,
      date = ?,
      status = ?,
      claim_type = ?,
      outcome_reason = ?,
      other_reason_notes = ?,
      signed_at = ?,
      updated_at = (datetime('now')),
      last_edited_by = ?
    WHERE id = ?
  `)

  const importAll = db.transaction(() => {
    for (const row of dataRows) {
      if (!row || !Array.isArray(row) || row.length === 0) continue

      let clientName = row[iClient] ? String(row[iClient]).trim() : ''
      const repName = row[iRep] ? String(row[iRep]).trim() : ''
      const leadId = row[iLeadId] ? String(row[iLeadId]).trim() : null

      if (!clientName && !repName && !leadId) {
        skipped++
        continue
      }

      if (!clientName) {
        clientName = leadId ? `Lead #${leadId}` : 'Unnamed Client'
      }

      const finalRepName = repName || sessionDisplayName
      const repUsername = finalRepName.toLowerCase().replace(/[^a-z0-9]/g, '')

      const dateStr = parseDateString(row[iDate])
      const rawStatus = row[iStatus] ? String(row[iStatus]).trim() : 'Sent E-Sign'
      const status = normalizeStatus(rawStatus)

      const rawClaim = row[iClaimType] ? String(row[iClaimType]).trim() : ''
      const claimType = normalizeClaimType(rawClaim)

      const rawReason = row[iReason] ? String(row[iReason]).trim() : ''
      const rawOther = row[iOtherNotes] ? String(row[iOtherNotes]).trim() : ''
      const outcomeReason = normalizeOutcomeReason(rawReason || rawOther)

      let otherNotes = rawOther || (rawReason && outcomeReason === 'Other' ? rawReason : null)
      const signedAt = status === 'Signed E-Sign' ? `${dateStr} 12:00:00` : null

      otherNotes = otherNotes ? maskSensitivePII(otherNotes) : null
      clientName = sanitizeCellText(clientName)

      // Check if duplicate exists with same lead_id or client_name + date + rep
      let existing: any
      if (leadId) {
        existing = db.prepare(`SELECT * FROM ssd_lead_records WHERE lead_id = ?`).get(leadId)
      }
      if (!existing) {
        existing = db.prepare(`SELECT * FROM ssd_lead_records WHERE LOWER(client_name) = LOWER(?) AND date = ? AND rep_username = ?`).get(clientName, dateStr, repUsername)
      }

      if (existing) {
        snapshotList.push({
          id: existing.id,
          rep_name: existing.rep_name,
          rep_username: existing.rep_username,
          client_name: existing.client_name,
          lead_id: existing.lead_id,
          date: existing.date,
          status: existing.status,
          claim_type: existing.claim_type,
          outcome_reason: existing.outcome_reason,
          other_reason_notes: existing.other_reason_notes,
          signed_at: existing.signed_at,
          converted_at: existing.converted_at,
          is_converted: existing.is_converted,
        })

        updateStmt.run(
          finalRepName,
          repUsername,
          clientName,
          dateStr,
          status,
          claimType,
          outcomeReason,
          otherNotes,
          signedAt,
          sessionDisplayName,
          existing.id
        )
        updated++
      } else {
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
          batchId,
          sessionDisplayName
        )
        imported++
      }
    }

    // Save batch record in import_batches
    db.prepare(`
      INSERT INTO import_batches (
        batch_id, lob, upload_type, filename, user_id, username, user_name,
        records_created, records_updated, snapshot_data, status
      ) VALUES (?, 'SSD', 'ssd_leads_import', ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(
      batchId,
      file.name,
      userId,
      sessionUsername,
      sessionDisplayName,
      imported,
      updated,
      snapshotList.length > 0 ? JSON.stringify(snapshotList) : null
    )
  })

  try {
    importAll()

    recordUploadAudit({
      userId,
      username: sessionUsername,
      userName: sessionDisplayName,
      uploadType: 'ssd_leads',
      filename: file.name,
      buffer,
      rowsProcessed: imported + updated,
      status: 'SUCCESS',
      details: `Batch ${batchId}: Imported ${imported} new leads, updated ${updated} existing records.`,
    })

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      imported,
      updated,
      skipped,
      message: `Successfully processed ${imported + updated} SSD lead records (${imported} new, ${updated} updated, ${skipped} skipped).`,
    })
  } catch (err: any) {
    console.error('[ssd-tracker import error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to import SSD lead records' }, { status: 500 })
  }
}
