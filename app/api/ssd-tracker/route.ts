import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sanitizeCellText, maskSensitivePII } from '@/lib/security'
import { SSD_STATUS_OPTIONS, SSD_CLAIM_TYPES, SSD_OUTCOME_REASONS } from '@/lib/ssdTrackerConstants'
export { SSD_STATUS_OPTIONS, SSD_CLAIM_TYPES, SSD_OUTCOME_REASONS }

export function isAuthorizedForSsdTracker(session: any): boolean {
  if (!session?.user) return false
  const userRole = (session.user as any)?.role || 'regular'
  const userLob = (session.user as any)?.lob || 'SSD'
  const perms = (session.user as any)?.permissions

  if (userRole === 'master' || userRole === 'superadmin' || userRole === 'qa') return true
  if (userRole === 'regular') return userLob === 'SSD'
  if (userRole === 'admin') {
    const allowedLobs: string[] = Array.isArray(perms?.allowedLobs) ? perms.allowedLobs : [userLob]
    return (
      userLob === 'SSD' ||
      allowedLobs.includes('SSD') ||
      allowedLobs.includes('All')
    )
  }
  return false
}

// GET /api/ssd-tracker — Fetch leads & metrics
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForSsdTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const rep = searchParams.get('rep')
    const statusFilter = searchParams.get('status')
    const claimFilter = searchParams.get('claim_type')
    const reasonFilter = searchParams.get('reason')
    const search = searchParams.get('search')

    const db = getDb()
    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'SSD'
    const currentUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const currentDisplayName = session.user?.name || ''

    // Build query
    let query = `SELECT * FROM ssd_lead_records WHERE 1=1`
    const params: any[] = []

    // Scoping: regular SSD reps only see their own records
    if (userRole === 'regular' && userLob === 'SSD') {
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
        query += ` AND status IN ('Sent E-Sign', 'Paper Retainer Sent')`
      } else if (statusFilter === 'Refused/Rejected') {
        query += ` AND status IN ('Client Refused Help', 'Case Rejected')`
      } else if (statusFilter === 'Converted') {
        query += ` AND (is_converted = 1 OR status = 'Signed E-Sign')`
      } else {
        query += ` AND status = ?`
        params.push(statusFilter)
      }
    }

    if (claimFilter && claimFilter !== 'All') {
      query += ` AND claim_type = ?`
      params.push(claimFilter)
    }

    if (reasonFilter && reasonFilter !== 'All') {
      query += ` AND outcome_reason = ?`
      params.push(reasonFilter)
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`
      query += ` AND (LOWER(client_name) LIKE ? OR LOWER(lead_id) LIKE ? OR LOWER(other_reason_notes) LIKE ?)`
      params.push(term, term, term)
    }

    query += ` ORDER BY date DESC, id DESC`

    const entries = db.prepare(query).all(...params) as any[]

    // Calculate Metrics for the filtered period
    let metricsQuery = `SELECT * FROM ssd_lead_records WHERE 1=1`
    const metricsParams: any[] = []

    if (userRole === 'regular' && userLob === 'SSD') {
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
    const paperSent = allPeriodEntries.filter((e) => e.status === 'Paper Retainer Sent').length
    const pendingSignatures = sentEsigns + paperSent
    const signedEsigns = allPeriodEntries.filter((e) => e.status === 'Signed E-Sign').length
    const sentRfc = allPeriodEntries.filter((e) => e.status === 'Sent RFC').length
    const rescheduled = allPeriodEntries.filter((e) => e.status === 'Appointment Rescheduled').length
    const crhCount = allPeriodEntries.filter((e) => e.status === 'Client Refused Help').length
    const rejectedCount = allPeriodEntries.filter((e) => e.status === 'Case Rejected').length
    const convertedCount = allPeriodEntries.filter((e) => e.is_converted === 1).length

    const totalEsignPool = pendingSignatures + signedEsigns
    const signedSuccessRate = totalEsignPool > 0 ? ((signedEsigns / totalEsignPool) * 100).toFixed(1) : '0.0'
    const caseConversionRate = signedEsigns > 0 ? ((convertedCount / signedEsigns) * 100).toFixed(1) : '0.0'

    // Outcome Reasons breakdown
    const reasonsBreakdown: Record<string, number> = {}
    for (const reason of SSD_OUTCOME_REASONS) {
      reasonsBreakdown[reason] = 0
    }
    for (const entry of allPeriodEntries) {
      if (entry.outcome_reason) {
        reasonsBreakdown[entry.outcome_reason] = (reasonsBreakdown[entry.outcome_reason] || 0) + 1
      }
    }

    // Claim Types breakdown
    const claimsBreakdown: Record<string, number> = {}
    for (const claim of SSD_CLAIM_TYPES) {
      claimsBreakdown[claim] = 0
    }
    for (const entry of allPeriodEntries) {
      if (entry.claim_type) {
        claimsBreakdown[entry.claim_type] = (claimsBreakdown[entry.claim_type] || 0) + 1
      }
    }

    // Get all active SSD Intake Reps strictly from active users and active agents
    const ssdUsers = db.prepare(`
      SELECT username AS rep_username, display_name
      FROM users 
      WHERE lob = 'SSD' AND active = 1 AND role = 'regular'
    `).all() as { rep_username: string; display_name: string | null }[]

    const ssdAgents = db.prepare(`
      SELECT name 
      FROM agents 
      WHERE lob = 'SSD' AND active = 1
    `).all() as { name: string }[]

    const inactiveNames = new Set(
      (db.prepare("SELECT display_name, username FROM users WHERE active = 0").all() as { display_name: string | null; username: string }[])
        .flatMap(u => [u.display_name, u.username])
        .filter(Boolean)
        .map(n => (n as string).toLowerCase().trim())
    )

    const repsMap = new Map<string, { rep_name: string; rep_username: string }>()

    for (const u of ssdUsers) {
      const name = (u.display_name || u.rep_username || '').trim()
      if (name && !inactiveNames.has(name.toLowerCase()) && !inactiveNames.has(u.rep_username.toLowerCase())) {
        repsMap.set(name.toLowerCase(), {
          rep_name: name,
          rep_username: u.rep_username || name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        })
      }
    }

    for (const a of ssdAgents) {
      const name = (a.name || '').trim()
      if (name && !inactiveNames.has(name.toLowerCase()) && !repsMap.has(name.toLowerCase())) {
        repsMap.set(name.toLowerCase(), {
          rep_name: name,
          rep_username: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        })
      }
    }

    const repsList = Array.from(repsMap.values()).sort((a, b) => a.rep_name.localeCompare(b.rep_name))

    return NextResponse.json({
      entries,
      summary: {
        total_leads: totalLeads,
        sent_esigns: sentEsigns,
        paper_sent: paperSent,
        pending_signatures: pendingSignatures,
        signed_esigns: signedEsigns,
        sent_rfc: sentRfc,
        rescheduled: rescheduled,
        crh_count: crhCount,
        rejected_count: rejectedCount,
        converted_count: convertedCount,
        signed_success_rate: Number(signedSuccessRate),
        case_conversion_rate: Number(caseConversionRate),
        reasons_breakdown: reasonsBreakdown,
        claims_breakdown: claimsBreakdown,
      },
      reps_list: repsList,
      is_personal_view: userRole === 'regular' && userLob === 'SSD',
    })
  } catch (err: any) {
    console.error('[ssd-tracker GET error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch SSD lead records' }, { status: 500 })
  }
}

// POST /api/ssd-tracker — Log a new SSD lead record
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForSsdTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      client_name,
      lead_id,
      date,
      status,
      claim_type,
      outcome_reason,
      other_reason_notes,
      rep_name: customRepName,
    } = body

    if (!client_name || !client_name.trim()) {
      return NextResponse.json({ error: "Lead/Client's Name is required" }, { status: 400 })
    }
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }
    if (!status || !SSD_STATUS_OPTIONS.includes(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const sessionDisplayName = session.user?.name || 'SSD Specialist'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'ssd_user'

    const repName = (userRole === 'master' || userRole === 'superadmin' || userRole === 'admin') && customRepName
      ? customRepName.trim()
      : sessionDisplayName

    const repUsername = (userRole === 'master' || userRole === 'superadmin' || userRole === 'admin') && customRepName
      ? customRepName.toLowerCase().replace(/[^a-z0-9]/g, '')
      : sessionUsername

    const signedAt = status === 'Signed E-Sign' ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null

    const sanitizedClientName = sanitizeCellText(client_name.trim())
    const sanitizedLeadId = lead_id ? sanitizeCellText(lead_id.trim()) : null
    const sanitizedNotes = other_reason_notes ? maskSensitivePII(other_reason_notes.trim()) : null

    const db = getDb()
    const insert = db.prepare(`
      INSERT INTO ssd_lead_records (
        rep_name, rep_username, client_name, lead_id, date, status, claim_type, outcome_reason, other_reason_notes, signed_at, last_edited_by
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)

    const result = insert.run(
      repName,
      repUsername,
      sanitizedClientName,
      sanitizedLeadId,
      date,
      status,
      claim_type || null,
      outcome_reason || null,
      sanitizedNotes,
      signedAt,
      sessionDisplayName
    )

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    console.error('[ssd-tracker POST error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to save SSD lead record' }, { status: 500 })
  }
}

// PUT /api/ssd-tracker — Update existing lead record (e.g. mark Signed, Sent RFC, edit claim type)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForSsdTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      id,
      client_name,
      lead_id,
      date,
      status,
      claim_type,
      outcome_reason,
      other_reason_notes,
      is_converted,
      rep_name: customRepName,
    } = body

    if (!id) {
      return NextResponse.json({ error: 'Record ID is required' }, { status: 400 })
    }

    const db = getDb()
    const existing = db.prepare(`SELECT * FROM ssd_lead_records WHERE id = ?`).get(id) as any
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'SSD'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const sessionDisplayName = session.user?.name || ''

    if (userRole === 'regular' && userLob === 'SSD' && existing.rep_username !== sessionUsername && existing.rep_name !== sessionDisplayName) {
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

    const sanitizedClientName = client_name ? sanitizeCellText(client_name.trim()) : existing.client_name
    const sanitizedLeadId = lead_id !== undefined ? (lead_id ? sanitizeCellText(lead_id.trim()) : null) : existing.lead_id
    const sanitizedNotes = other_reason_notes !== undefined ? (other_reason_notes ? maskSensitivePII(other_reason_notes.trim()) : null) : existing.other_reason_notes
    const newConverted = is_converted !== undefined ? (is_converted ? 1 : 0) : existing.is_converted

    const update = db.prepare(`
      UPDATE ssd_lead_records SET
        rep_name = ?,
        rep_username = ?,
        client_name = ?,
        lead_id = ?,
        date = ?,
        status = ?,
        claim_type = ?,
        outcome_reason = ?,
        other_reason_notes = ?,
        signed_at = ?,
        is_converted = ?,
        updated_at = (datetime('now')),
        last_edited_by = ?
      WHERE id = ?
    `)

    update.run(
      repName,
      repUsername,
      sanitizedClientName,
      sanitizedLeadId,
      date || existing.date,
      newStatus,
      claim_type !== undefined ? (claim_type || null) : existing.claim_type,
      outcome_reason !== undefined ? (outcome_reason || null) : existing.outcome_reason,
      sanitizedNotes,
      signedAt,
      newConverted,
      sessionDisplayName,
      id
    )

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[ssd-tracker PUT error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to update SSD lead record' }, { status: 500 })
  }
}

// DELETE /api/ssd-tracker?id=X — Delete SSD lead record
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForSsdTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 })
    }

    const db = getDb()
    const existing = db.prepare(`SELECT * FROM ssd_lead_records WHERE id = ?`).get(id) as any
    if (!existing) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'SSD'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const sessionDisplayName = session.user?.name || ''

    if (userRole === 'regular' && userLob === 'SSD' && existing.rep_username !== sessionUsername && existing.rep_name !== sessionDisplayName) {
      return NextResponse.json({ error: 'Forbidden: You can only delete your own lead records' }, { status: 403 })
    }

    db.prepare(`DELETE FROM ssd_lead_records WHERE id = ?`).run(id)
    return NextResponse.json({ success: true, deletedId: id })
  } catch (err: any) {
    console.error('[ssd-tracker DELETE error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to delete SSD lead record' }, { status: 500 })
  }
}
