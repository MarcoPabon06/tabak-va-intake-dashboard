import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sanitizeCellText, maskSensitivePII } from '@/lib/security'

// Valid statuses & outcome reasons
export const VA_STATUS_OPTIONS = [
  'Sent E-Sign',
  'Sign Follow Up',
  'Signed E-Sign',
  'Client Refused Help',
  'Case Rejected',
] as const

export const VA_OUTCOME_REASONS = [
  'Already Represented',
  'Not interested',
  'Fee is too high',
  'Say they will call back',
  'Second Hang Up',
  'Client will review FA',
  'Other',
] as const

export function isAuthorizedForVaTracker(session: any): boolean {
  if (!session?.user) return false
  const userRole = (session.user as any)?.role || 'regular'
  const userLob = (session.user as any)?.lob || 'VA'
  const perms = (session.user as any)?.permissions

  if (userRole === 'master' || userRole === 'superadmin' || userRole === 'qa') return true
  if (userRole === 'regular') return userLob === 'VA'
  if (userRole === 'admin') {
    const allowedLobs: string[] = Array.isArray(perms?.allowedLobs) ? perms.allowedLobs : [userLob]
    return (
      userLob === 'VA' ||
      allowedLobs.includes('VA') ||
      allowedLobs.includes('All')
    )
  }
  return false
}

// GET /api/va-tracker — Fetch leads & metrics
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAuthorizedForVaTracker(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const rep = searchParams.get('rep')
  const statusFilter = searchParams.get('status')
  const reasonFilter = searchParams.get('reason')
  const search = searchParams.get('search')

  const db = getDb()
  const userRole = (session.user as any)?.role || 'regular'
  const userLob = (session.user as any)?.lob || 'VA'
  const currentUsername = (session.user as any)?.email || (session.user as any)?.username || ''
  const currentDisplayName = session.user?.name || ''

  // Build query
  let query = `SELECT * FROM va_lead_records WHERE 1=1`
  const params: any[] = []

  // Scoping: regular VA reps only see their own records
  if (userRole === 'regular' && userLob === 'VA') {
    query += ` AND (rep_username = ? OR LOWER(rep_name) = LOWER(?))`
    params.push(currentUsername, currentDisplayName)
  } else if (rep && rep !== 'All') {
    query += ` AND (rep_username = ? OR LOWER(rep_name) = LOWER(?))`
    params.push(rep, rep)
  }

  if (from) {
    query += ` AND date >= ?`
    params.push(from)
  }
  if (to) {
    query += ` AND date <= ?`
    params.push(to)
  }

  if (statusFilter && statusFilter !== 'All') {
    if (statusFilter === 'Pending') {
      query += ` AND status IN ('Sent E-Sign', 'Sign Follow Up')`
    } else if (statusFilter === 'Refused/Rejected') {
      query += ` AND status IN ('Client Refused Help', 'Case Rejected')`
    } else {
      query += ` AND status = ?`
      params.push(statusFilter)
    }
  }

  if (reasonFilter && reasonFilter !== 'All') {
    query += ` AND outcome_reason = ?`
    params.push(reasonFilter)
  }

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`
    query += ` AND (LOWER(veteran_name) LIKE ? OR LOWER(lead_id) LIKE ? OR LOWER(other_reason_notes) LIKE ?)`
    params.push(term, term, term)
  }

  query += ` ORDER BY date DESC, id DESC`

  const entries = db.prepare(query).all(...params) as any[]

  // Calculate Metrics for the filtered period
  let metricsQuery = `SELECT * FROM va_lead_records WHERE 1=1`
  const metricsParams: any[] = []

  if (userRole === 'regular' && userLob === 'VA') {
    metricsQuery += ` AND (rep_username = ? OR LOWER(rep_name) = LOWER(?))`
    metricsParams.push(currentUsername, currentDisplayName)
  } else if (rep && rep !== 'All') {
    metricsQuery += ` AND (rep_username = ? OR LOWER(rep_name) = LOWER(?))`
    metricsParams.push(rep, rep)
  }

  if (from) {
    metricsQuery += ` AND date >= ?`
    metricsParams.push(from)
  }
  if (to) {
    metricsQuery += ` AND date <= ?`
    metricsParams.push(to)
  }

  const allPeriodEntries = db.prepare(metricsQuery).all(...metricsParams) as any[]

  const totalLeads = allPeriodEntries.length
  const sentEsigns = allPeriodEntries.filter((e) => e.status === 'Sent E-Sign').length
  const followUps = allPeriodEntries.filter((e) => e.status === 'Sign Follow Up').length
  const pendingSignatures = sentEsigns + followUps
  const signedEsigns = allPeriodEntries.filter((e) => e.status === 'Signed E-Sign').length
  const crhCount = allPeriodEntries.filter((e) => e.status === 'Client Refused Help').length
  const rejectedCount = allPeriodEntries.filter((e) => e.status === 'Case Rejected').length

  const totalEsignPool = pendingSignatures + signedEsigns
  const conversionRate = totalEsignPool > 0 ? ((signedEsigns / totalEsignPool) * 100).toFixed(1) : '0.0'

  // Reason breakdown
  const reasonsBreakdown: Record<string, number> = {}
  for (const reason of VA_OUTCOME_REASONS) {
    reasonsBreakdown[reason] = 0
  }
  for (const entry of allPeriodEntries) {
    if (entry.outcome_reason) {
      reasonsBreakdown[entry.outcome_reason] = (reasonsBreakdown[entry.outcome_reason] || 0) + 1
    }
  }

  // Get distinct reps for dropdown filter
  const repsList = db.prepare(`SELECT DISTINCT rep_name, rep_username FROM va_lead_records ORDER BY rep_name ASC`).all() as { rep_name: string; rep_username: string }[]

  return NextResponse.json({
    entries,
    summary: {
      total_leads: totalLeads,
      sent_esigns: sentEsigns,
      follow_ups: followUps,
      pending_signatures: pendingSignatures,
      signed_esigns: signedEsigns,
      crh_count: crhCount,
      rejected_count: rejectedCount,
      conversion_rate: Number(conversionRate),
      reasons_breakdown: reasonsBreakdown,
    },
    reps_list: repsList,
    is_personal_view: userRole === 'regular' && userLob === 'VA',
  })
}

// POST /api/va-tracker — Log a new lead record
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      veteran_name,
      lead_id,
      date,
      status,
      outcome_reason,
      other_reason_notes,
      rep_name: customRepName,
    } = body

    if (!veteran_name || !veteran_name.trim()) {
      return NextResponse.json({ error: "Veteran's Name is required" }, { status: 400 })
    }
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }
    if (!status || !VA_STATUS_OPTIONS.includes(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const sessionDisplayName = session.user?.name || 'VA Specialist'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'va_user'

    const repName = (userRole === 'master' || userRole === 'superadmin' || userRole === 'admin') && customRepName
      ? customRepName.trim()
      : sessionDisplayName

    const repUsername = (userRole === 'master' || userRole === 'superadmin' || userRole === 'admin') && customRepName
      ? customRepName.toLowerCase().replace(/[^a-z0-9]/g, '')
      : sessionUsername

    const signedAt = status === 'Signed E-Sign' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null

    const sanitizedVeteranName = sanitizeCellText(veteran_name.trim())
    const sanitizedLeadId = lead_id ? sanitizeCellText(lead_id.trim()) : null
    const sanitizedNotes = other_reason_notes ? maskSensitivePII(other_reason_notes.trim()) : null

    const db = getDb()
    const insert = db.prepare(`
      INSERT INTO va_lead_records (
        rep_name, rep_username, veteran_name, lead_id, date, status, outcome_reason, other_reason_notes, signed_at, last_edited_by
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)

    const result = insert.run(
      repName,
      repUsername,
      sanitizedVeteranName,
      sanitizedLeadId,
      date,
      status,
      outcome_reason || null,
      sanitizedNotes,
      signedAt,
      sessionDisplayName
    )

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    console.error('[va-tracker POST error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to save lead record' }, { status: 500 })
  }
}

// PUT /api/va-tracker — Update existing lead record (e.g. mark Signed, edit outcome reason)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      id,
      veteran_name,
      lead_id,
      date,
      status,
      outcome_reason,
      other_reason_notes,
      rep_name: customRepName,
    } = body

    if (!id) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 })
    }

    const db = getDb()
    const existing = db.prepare(`SELECT * FROM va_lead_records WHERE id = ?`).get(id) as any
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'VA'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const sessionDisplayName = session.user?.name || ''

    // Specialist can only edit their own records; Managers can edit any
    if (userRole === 'regular' && userLob === 'VA' && existing.rep_username !== sessionUsername && existing.rep_name !== sessionDisplayName) {
      return NextResponse.json({ error: 'Forbidden: You can only edit your own lead records' }, { status: 403 })
    }

    const newStatus = status || existing.status
    let signedAt = existing.signed_at
    if (newStatus === 'Signed E-Sign' && existing.status !== 'Signed E-Sign') {
      signedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    } else if (newStatus !== 'Signed E-Sign' && existing.status === 'Signed E-Sign') {
      signedAt = null
    }

    const repName = customRepName ? customRepName.trim() : existing.rep_name
    const repUsername = customRepName ? customRepName.toLowerCase().replace(/[^a-z0-9]/g, '') : existing.rep_username

    const sanitizedVeteranName = veteran_name ? sanitizeCellText(veteran_name.trim()) : existing.veteran_name
    const sanitizedLeadId = lead_id !== undefined ? (lead_id ? sanitizeCellText(lead_id.trim()) : null) : existing.lead_id
    const sanitizedNotes = other_reason_notes !== undefined ? (other_reason_notes ? maskSensitivePII(other_reason_notes.trim()) : null) : existing.other_reason_notes

    const update = db.prepare(`
      UPDATE va_lead_records SET
        rep_name = ?,
        rep_username = ?,
        veteran_name = ?,
        lead_id = ?,
        date = ?,
        status = ?,
        outcome_reason = ?,
        other_reason_notes = ?,
        signed_at = ?,
        updated_at = (datetime('now')),
        last_edited_by = ?
      WHERE id = ?
    `)

    update.run(
      repName,
      repUsername,
      sanitizedVeteranName,
      sanitizedLeadId,
      date || existing.date,
      newStatus,
      outcome_reason !== undefined ? (outcome_reason || null) : existing.outcome_reason,
      sanitizedNotes,
      signedAt,
      sessionDisplayName,
      id
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[va-tracker PUT error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to update lead record' }, { status: 500 })
  }
}

// DELETE /api/va-tracker?id=X — Delete lead record
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 })
    }

    const db = getDb()
    const existing = db.prepare(`SELECT * FROM va_lead_records WHERE id = ?`).get(id) as any
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'VA'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const sessionDisplayName = session.user?.name || ''

    if (userRole === 'regular' && userLob === 'VA' && existing.rep_username !== sessionUsername && existing.rep_name !== sessionDisplayName) {
      return NextResponse.json({ error: 'Forbidden: You can only delete your own lead records' }, { status: 403 })
    }

    db.prepare(`DELETE FROM va_lead_records WHERE id = ?`).run(id)
    return NextResponse.json({ success: true, deletedId: id })
  } catch (err: any) {
    console.error('[va-tracker DELETE error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to delete lead record' }, { status: 500 })
  }
}
