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

export function isAuthorizedVaTeamLead(session: any): boolean {
  if (!session?.user) return false
  const userRole = (session.user as any)?.role || 'regular'
  const userLob = (session.user as any)?.lob || 'VA'
  const perms = (session.user as any)?.permissions

  if (userRole === 'master' || userRole === 'superadmin') return true
  if (userRole === 'admin') {
    const allowedLobs: string[] = Array.isArray(perms?.allowedLobs) ? perms.allowedLobs : [userLob]
    return userLob === 'VA' || allowedLobs.includes('VA') || allowedLobs.includes('All')
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

  // Fast SQL Aggregate Metrics Calculation for VA
  let whereClause = ` WHERE 1=1`
  const metricsParams: any[] = []

  if (userRole === 'regular' && userLob === 'VA') {
    whereClause += ` AND (rep_username = ? OR LOWER(rep_name) = LOWER(?))`
    metricsParams.push(currentUsername, currentDisplayName)
  } else if (rep && rep !== 'All') {
    whereClause += ` AND (rep_username = ? OR LOWER(rep_name) = LOWER(?))`
    metricsParams.push(rep, rep)
  }

  if (from) {
    whereClause += ` AND date >= ?`
    metricsParams.push(from)
  }
  if (to) {
    whereClause += ` AND date <= ?`
    metricsParams.push(to)
  }

  const aggStats = db.prepare(`
    SELECT 
      COUNT(*) as total_leads,
      SUM(CASE WHEN status = 'Sent E-Sign' THEN 1 ELSE 0 END) as sent_esigns,
      SUM(CASE WHEN status = 'Sign Follow Up' THEN 1 ELSE 0 END) as follow_ups,
      SUM(CASE WHEN status = 'Signed E-Sign' THEN 1 ELSE 0 END) as signed_esigns,
      SUM(CASE WHEN status = 'Client Refused Help' THEN 1 ELSE 0 END) as crh_count,
      SUM(CASE WHEN status = 'Case Rejected' THEN 1 ELSE 0 END) as rejected_count
    FROM va_lead_records
    ${whereClause}
  `).get(...metricsParams) as any || {}

  const totalLeads = aggStats.total_leads || 0
  const sentEsigns = aggStats.sent_esigns || 0
  const followUps = aggStats.follow_ups || 0
  const pendingSignatures = sentEsigns + followUps
  const signedEsigns = aggStats.signed_esigns || 0
  const crhCount = aggStats.crh_count || 0
  const rejectedCount = aggStats.rejected_count || 0

  const totalEsignPool = pendingSignatures + signedEsigns
  const conversionRate = totalEsignPool > 0 ? ((signedEsigns / totalEsignPool) * 100).toFixed(1) : '0.0'

  // Fast Reason Breakdown
  const reasonsBreakdown: Record<string, number> = {}
  for (const reason of VA_OUTCOME_REASONS) {
    reasonsBreakdown[reason] = 0
  }
  const reasonRows = db.prepare(`
    SELECT outcome_reason, COUNT(*) as cnt
    FROM va_lead_records
    ${whereClause} AND outcome_reason IS NOT NULL AND outcome_reason != ''
    GROUP BY outcome_reason
  `).all(...metricsParams) as { outcome_reason: string; cnt: number }[]
  for (const r of reasonRows) {
    if (r.outcome_reason) reasonsBreakdown[r.outcome_reason] = r.cnt
  }

    // Get all active VA Intake Reps strictly from active users and active agents
    const vaUsers = db.prepare(`
      SELECT username AS rep_username, display_name
      FROM users 
      WHERE (lob = 'VA' OR lob IS NULL) AND active = 1 AND role = 'regular'
    `).all() as { rep_username: string; display_name: string | null }[]

    const vaAgents = db.prepare(`
      SELECT name 
      FROM agents 
      WHERE (lob = 'VA' OR lob IS NULL) AND active = 1
    `).all() as { name: string }[]

    const inactiveNames = new Set(
      (db.prepare("SELECT display_name, username FROM users WHERE active = 0").all() as { display_name: string | null; username: string }[])
        .flatMap(u => [u.display_name, u.username])
        .filter(Boolean)
        .map(n => (n as string).toLowerCase().trim())
    )

    const repsMap = new Map<string, { rep_name: string; rep_username: string }>()

    for (const u of vaUsers) {
      const name = (u.display_name || u.rep_username || '').trim()
      if (name && !inactiveNames.has(name.toLowerCase()) && !inactiveNames.has(u.rep_username.toLowerCase())) {
        repsMap.set(name.toLowerCase(), {
          rep_name: name,
          rep_username: u.rep_username || name.toLowerCase().replace(/[^a-z0-9]/g, ''),
        })
      }
    }

    for (const a of vaAgents) {
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

// DELETE /api/va-tracker — Delete single or bulk VA lead records
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
    const singleId = searchParams.get('id')
    const queryIds = searchParams.get('ids')

    let targetIds: number[] = []
    if (singleId) {
      targetIds = [parseInt(singleId)].filter(n => !isNaN(n))
    } else if (queryIds) {
      targetIds = queryIds.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    } else {
      try {
        const body = await req.json()
        if (Array.isArray(body?.ids)) {
          targetIds = body.ids.map((n: any) => parseInt(n)).filter((n: any) => !isNaN(n))
        }
      } catch {
        // No JSON body
      }
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'Missing lead record ID(s) to delete' }, { status: 400 })
    }

    const db = getDb()
    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'VA'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const sessionDisplayName = session.user?.name || ''
    const canManageAll = userRole === 'master' || userRole === 'superadmin' || userRole === 'admin'

    let deletedCount = 0

    const deleteTx = db.transaction(() => {
      for (const id of targetIds) {
        const existing = db.prepare(`SELECT * FROM va_lead_records WHERE id = ?`).get(id) as any
        if (!existing) continue

        if (!canManageAll && userRole === 'regular' && userLob === 'VA') {
          if (existing.rep_username !== sessionUsername && existing.rep_name !== sessionDisplayName) {
            continue // Skip records regular user doesn't own
          }
        }

        db.prepare(`DELETE FROM va_lead_records WHERE id = ?`).run(id)
        deletedCount++
      }
    })

    deleteTx()

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} VA lead record${deletedCount === 1 ? '' : 's'}.`,
    })
  } catch (err: any) {
    console.error('[va-tracker DELETE error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to delete VA lead record(s)' }, { status: 500 })
  }
}
