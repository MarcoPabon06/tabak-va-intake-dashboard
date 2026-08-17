import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'
import { isAuthorizedForVaTracker, VA_STATUS_OPTIONS, VA_OUTCOME_REASONS } from '../route'

function parseDateString(str: string): string {
  str = str.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.split('T')[0]

  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (match) {
    let p1 = match[1].padStart(2, '0')
    let p2 = match[2].padStart(2, '0')
    let y = match[3]
    if (y.length === 2) y = '20' + y
    if (parseInt(p1) > 12) {
      return `${y}-${p2}-${p1}`
    } else {
      return `${y}-${p1}-${p2}`
    }
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }
  return str
}

function normalizeStatus(raw: string): string {
  if (!raw) return 'Sent E-Sign'
  const lower = raw.trim().toLowerCase()
  if (lower.includes('signed') && (lower.includes('e-sign') || lower.includes('esign') || lower.includes('e sign') || lower.includes('yes'))) {
    return 'Signed E-Sign'
  }
  if (lower.includes('follow')) {
    return 'Sign Follow Up'
  }
  if (lower.includes('refuse') || lower.includes('crh')) {
    return 'Client Refused Help'
  }
  if (lower.includes('reject')) {
    return 'Case Rejected'
  }
  if (lower.includes('sent')) {
    return 'Sent E-Sign'
  }
  return 'Sent E-Sign'
}

function normalizeOutcomeReason(raw: string): string {
  if (!raw) return ''
  const lower = raw.trim().toLowerCase()
  if (lower.includes('already') || lower.includes('represented')) return 'Already Represented'
  if (lower.includes('not interested') || lower.includes('no interest')) return 'Not interested'
  if (lower.includes('fee') || lower.includes('high')) return 'Fee is too high'
  if (lower.includes('call back') || lower.includes('callback')) return 'Say they will call back'
  if (lower.includes('hang up') || lower.includes('hangup')) return 'Second Hang Up'
  if (lower.includes('review') || lower.includes('fa') || lower.includes('agreement')) return 'Client will review FA'
  if (lower.includes('other')) return 'Other'
  return 'Other'
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAuthorizedForVaTracker(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return NextResponse.json({ error: 'No sheet found in Excel workbook' }, { status: 400 })
  }

  const ws = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Find header row
  let headerIdx = -1
  const repCandidates = ['intake rep', 'rep name', 'rep', 'specialist', 'advisor', 'asesor', 'nombre']
  const veteranCandidates = ['veteran', 'veteran name', "veteran's name", 'client', 'client name', 'cliente', 'lead']

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue
    const hasRep = row.some(cell => {
      if (!cell) return false
      const val = cell.toString().trim().toLowerCase()
      return repCandidates.some(c => val === c || val.includes(c))
    })
    const hasVeteran = row.some(cell => {
      if (!cell) return false
      const val = cell.toString().trim().toLowerCase()
      return veteranCandidates.some(c => val === c || val.includes(c))
    })
    if (hasRep || hasVeteran) {
      headerIdx = i
      break
    }
  }

  // If no header found, assume row 0 is header
  if (headerIdx === -1) {
    headerIdx = 0
  }

  const headers: any[] = rows[headerIdx] || []
  const dataRows = rows.slice(headerIdx + 1)

  const findCol = (candidates: string[], fallbackIdx: number) => {
    let idx = headers.findIndex((h) => {
      if (!h) return false
      const str = h.toString().trim().toLowerCase()
      return candidates.some((c) => str === c)
    })
    if (idx === -1) {
      idx = headers.findIndex((h) => {
        if (!h) return false
        const str = h.toString().trim().toLowerCase()
        return candidates.some((c) => str.includes(c))
      })
    }
    return idx !== -1 ? idx : fallbackIdx
  }

  const iRep = findCol(['intake rep', 'rep name', 'rep', 'specialist', 'asesor'], 0)
  const iVeteran = findCol(['veteran name', "veteran's name", 'veteran', 'client name', 'client'], 1)
  const iLeadId = findCol(['lead id', 'lead_id', 'lead', 'id', 'case id'], 2)
  const iDate = findCol(['date', 'fecha', 'date sent', 'sent date'], 3)
  const iStatus = findCol(['status', 'estado', 'outcome'], 4)
  const iReason = findCol(['reason', 'outcome reason', 'reason for previous outcome', 'motivo'], 5)
  const iOtherNotes = findCol(['other reason', 'other', 'notes', 'comments', 'free hand', 'detalles'], 6)

  const db = getDb()
  const sessionDisplayName = session.user?.name || 'VA Specialist'
  let imported = 0
  let skipped = 0

  const insert = db.prepare(`
    INSERT INTO va_lead_records (
      rep_name, rep_username, veteran_name, lead_id, date, status, outcome_reason, other_reason_notes, signed_at, last_edited_by
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `)

  const importAll = db.transaction(() => {
    for (const row of dataRows) {
      if (!row || !Array.isArray(row) || row.length === 0) continue

      const veteranName = row[iVeteran] ? String(row[iVeteran]).trim() : ''
      if (!veteranName) {
        skipped++
        continue
      }

      const repName = row[iRep] ? String(row[iRep]).trim() : sessionDisplayName
      const repUsername = repName.toLowerCase().replace(/[^a-z0-9]/g, '')
      const leadId = row[iLeadId] ? String(row[iLeadId]).trim() : null

      let dateVal = row[iDate]
      let dateStr: string
      if (dateVal instanceof Date) {
        dateStr = dateVal.toISOString().split('T')[0]
      } else if (typeof dateVal === 'number') {
        const d = XLSX.SSF.parse_date_code(dateVal)
        dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      } else if (typeof dateVal === 'string') {
        dateStr = parseDateString(dateVal)
      } else {
        dateStr = new Date().toISOString().split('T')[0]
      }

      const rawStatus = row[iStatus] ? String(row[iStatus]).trim() : 'Sent E-Sign'
      const status = normalizeStatus(rawStatus)

      const rawReason = row[iReason] ? String(row[iReason]).trim() : ''
      const outcomeReason = rawReason ? normalizeOutcomeReason(rawReason) : null

      const otherNotes = row[iOtherNotes] ? String(row[iOtherNotes]).trim() : null
      const signedAt = status === 'Signed E-Sign' ? `${dateStr} 12:00:00` : null

      // Check if duplicate exists with same lead_id or veteran_name + date + rep
      let existing: any
      if (leadId) {
        existing = db.prepare(`SELECT id FROM va_lead_records WHERE lead_id = ?`).get(leadId)
      }
      if (!existing) {
        existing = db.prepare(`SELECT id FROM va_lead_records WHERE LOWER(veteran_name) = LOWER(?) AND date = ? AND rep_username = ?`).get(veteranName, dateStr, repUsername)
      }

      if (existing) {
        // Update existing record
        db.prepare(`
          UPDATE va_lead_records SET
            status = ?,
            outcome_reason = COALESCE(?, outcome_reason),
            other_reason_notes = COALESCE(?, other_reason_notes),
            signed_at = COALESCE(?, signed_at),
            updated_at = (datetime('now')),
            last_edited_by = ?
          WHERE id = ?
        `).run(status, outcomeReason, otherNotes, signedAt, sessionDisplayName, existing.id)
      } else {
        insert.run(
          repName,
          repUsername,
          veteranName,
          leadId,
          dateStr,
          status,
          outcomeReason,
          otherNotes,
          signedAt,
          sessionDisplayName
        )
      }

      imported++
    }
  })

  importAll()

  return NextResponse.json({ success: true, imported, skipped })
}
