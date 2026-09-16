import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { isAuthorizedForVaTracker, isAuthorizedVaTeamLead } from '../route'
import { sanitizeCellText, maskSensitivePII } from '@/lib/security'
import { getBusinessDate } from '@/lib/dateUtils'

export const CALLBACK_OUTCOME_OPTIONS = [
  'Contacting',
  'Sent E-Sign',
  'Signed E-Sign',
  'Client Refused Help',
  'Case Rejected',
] as const

// GET /api/va-tracker/callbacks — Retrieve scheduled callbacks and live alert metrics
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') || 'all' // 'alerts' | 'pending' | 'overdue' | 'today' | 'upcoming' | 'completed' | 'all'
    const rep = searchParams.get('rep')
    const search = searchParams.get('search')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const db = getDb()
    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'VA'
    const currentUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const currentDisplayName = session.user?.name || ''
    const isMaster = isAuthorizedVaTeamLead(session)

    // Current local time string (YYYY-MM-DD HH:mm:ss)
    const now = new Date()
    const todayStr = getBusinessDate(now)
    const currentTimeStr = now.toTimeString().slice(0, 5) // HH:mm
    const currentDateTimeStr = `${todayStr} ${currentTimeStr}:00`

    // Scoping condition
    let scopeSql = ''
    const scopeParams: any[] = []

    if (!isMaster && userRole === 'regular') {
      scopeSql = ` AND (LOWER(TRIM(rep_username)) = LOWER(TRIM(?)) OR LOWER(TRIM(rep_name)) = LOWER(TRIM(?)))`
      scopeParams.push(currentUsername, currentDisplayName)
    } else if (rep && rep !== 'All') {
      scopeSql = ` AND (LOWER(TRIM(rep_username)) = LOWER(TRIM(?)) OR LOWER(TRIM(rep_name)) = LOWER(TRIM(?)))`
      scopeParams.push(rep, rep)
    }

    // SPECIAL LIGHTWEIGHT MODE: alerts polling
    if (view === 'alerts') {
      // Find callbacks that are PENDING and scheduled_datetime <= currentDateTimeStr (Due now or Overdue within last 24h)
      const dueNowQuery = `
        SELECT * FROM va_scheduled_callbacks
        WHERE status = 'PENDING'
          AND scheduled_datetime <= ?
          AND callback_date >= date(?, '-2 day')
          ${scopeSql}
        ORDER BY scheduled_datetime ASC
        LIMIT 10
      `
      const dueNow = db.prepare(dueNowQuery).all(currentDateTimeStr, todayStr, ...scopeParams)

      // Total overdue count
      const overdueCountRow = db.prepare(`
        SELECT COUNT(*) as count FROM va_scheduled_callbacks
        WHERE status = 'PENDING' AND scheduled_datetime < ? ${scopeSql}
      `).get(currentDateTimeStr, ...scopeParams) as { count: number }

      // Total due today count
      const dueTodayCountRow = db.prepare(`
        SELECT COUNT(*) as count FROM va_scheduled_callbacks
        WHERE status = 'PENDING' AND callback_date = ? ${scopeSql}
      `).get(todayStr, ...scopeParams) as { count: number }

      return NextResponse.json({
        dueNow,
        overdueCount: overdueCountRow?.count || 0,
        dueTodayCount: dueTodayCountRow?.count || 0,
        currentDateTime: currentDateTimeStr,
      })
    }

    // Standard list query
    let query = `SELECT * FROM va_scheduled_callbacks WHERE 1=1 ${scopeSql}`
    const params: any[] = [...scopeParams]

    if (view === 'pending') {
      query += ` AND status = 'PENDING'`
    } else if (view === 'overdue') {
      query += ` AND status = 'PENDING' AND scheduled_datetime < '${currentDateTimeStr}'`
    } else if (view === 'today') {
      query += ` AND status = 'PENDING' AND callback_date = '${todayStr}'`
    } else if (view === 'upcoming') {
      query += ` AND status = 'PENDING' AND callback_date > '${todayStr}'`
    } else if (view === 'completed') {
      query += ` AND status = 'COMPLETED'`
    }

    if (from && to) {
      query += ` AND callback_date >= ? AND callback_date <= ?`
      params.push(from, to)
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`
      query += ` AND (veteran_name LIKE ? OR lead_id LIKE ? OR phone_number LIKE ? OR notes LIKE ?)`
      params.push(s, s, s, s)
    }

    // Default sorting: pending overdue first, then chronological
    if (view === 'completed') {
      query += ` ORDER BY resolved_at DESC LIMIT 200`
    } else {
      query += ` ORDER BY status ASC, scheduled_datetime ASC LIMIT 300`
    }

    const callbacks = db.prepare(query).all(...params)

    // Summary counts for badges
    const totalPendingRow = db.prepare(`SELECT COUNT(*) as count FROM va_scheduled_callbacks WHERE status = 'PENDING' ${scopeSql}`).get(...scopeParams) as { count: number }
    const totalOverdueRow = db.prepare(`SELECT COUNT(*) as count FROM va_scheduled_callbacks WHERE status = 'PENDING' AND scheduled_datetime < ? ${scopeSql}`).get(currentDateTimeStr, ...scopeParams) as { count: number }
    const totalTodayRow = db.prepare(`SELECT COUNT(*) as count FROM va_scheduled_callbacks WHERE status = 'PENDING' AND callback_date = ? ${scopeSql}`).get(todayStr, ...scopeParams) as { count: number }
    const totalCompletedRow = db.prepare(`SELECT COUNT(*) as count FROM va_scheduled_callbacks WHERE status = 'COMPLETED' ${scopeSql}`).get(...scopeParams) as { count: number }

    return NextResponse.json({
      callbacks,
      counts: {
        pending: totalPendingRow?.count || 0,
        overdue: totalOverdueRow?.count || 0,
        today: totalTodayRow?.count || 0,
        completed: totalCompletedRow?.count || 0,
      },
      currentDateTime: currentDateTimeStr,
    })
  } catch (err: any) {
    console.error('[va-tracker/callbacks GET error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/va-tracker/callbacks — Schedule a new callback
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const {
      veteran_name,
      lead_id,
      phone_number,
      callback_date,
      callback_time,
      notes,
      rep_name: customRepName,
    } = body

    if (!veteran_name || !veteran_name.trim()) {
      return NextResponse.json({ error: "Veteran's Name is required" }, { status: 400 })
    }
    if (!callback_date) {
      return NextResponse.json({ error: 'Callback Date is required' }, { status: 400 })
    }
    if (!callback_time) {
      return NextResponse.json({ error: 'Callback Time is required' }, { status: 400 })
    }

    const db = getDb()
    const isMaster = isAuthorizedVaTeamLead(session)
    const sessionDisplayName = session.user?.name || 'VA Specialist'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'va_user'

    let finalRepName = sessionDisplayName
    let finalRepUsername = sessionUsername

    if (isMaster && customRepName && customRepName.trim()) {
      finalRepName = customRepName.trim()
      const u = db.prepare('SELECT username FROM users WHERE display_name = ? OR username = ?').get(finalRepName, finalRepName) as any
      finalRepUsername = u?.username || finalRepName.toLowerCase().replace(/[^a-z0-9]/g, '')
    }

    const scheduledDatetime = `${callback_date} ${callback_time}:00`

    const stmt = db.prepare(`
      INSERT INTO va_scheduled_callbacks (
        lead_id, veteran_name, phone_number, rep_name, rep_username,
        callback_date, callback_time, scheduled_datetime, notes,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'), datetime('now'))
    `)

    const result = stmt.run(
      lead_id ? sanitizeCellText(lead_id) : null,
      sanitizeCellText(veteran_name),
      phone_number ? sanitizeCellText(phone_number) : null,
      finalRepName,
      finalRepUsername,
      callback_date,
      callback_time,
      scheduledDatetime,
      notes ? sanitizeCellText(notes) : null
    )

    return NextResponse.json({
      success: true,
      id: Number(result.lastInsertRowid),
      message: `Scheduled callback created for ${veteran_name} at ${callback_date} ${callback_time}`,
    })
  } catch (err: any) {
    console.error('[va-tracker/callbacks POST error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/va-tracker/callbacks — Resolve callback outcome, reschedule, or edit
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { id, action = 'resolve' } = body

    if (!id) {
      return NextResponse.json({ error: 'Callback ID is required' }, { status: 400 })
    }

    const db = getDb()
    const isMaster = isAuthorizedVaTeamLead(session)
    const sessionDisplayName = session.user?.name || 'VA Specialist'
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'va_user'

    const existing = db.prepare('SELECT * FROM va_scheduled_callbacks WHERE id = ?').get(id) as any
    if (!existing) {
      return NextResponse.json({ error: 'Callback record not found' }, { status: 404 })
    }

    // Scoping: regular reps can only update their own callbacks
    if (!isMaster) {
      const isOwner =
        existing.rep_username?.toLowerCase() === sessionUsername.toLowerCase() ||
        existing.rep_name?.toLowerCase() === sessionDisplayName.toLowerCase()
      if (!isOwner) {
        return NextResponse.json({ error: 'Forbidden: You can only update your own callbacks' }, { status: 403 })
      }
    }

    // 1. ACTION: RESOLVE OUTCOME (Mandatory Law Ruler status update)
    if (action === 'resolve') {
      const {
        outcome_status,
        outcome_reason,
        other_reason_notes,
      } = body

      if (!outcome_status || !CALLBACK_OUTCOME_OPTIONS.includes(outcome_status)) {
        return NextResponse.json({ error: 'Valid outcome status is required (Contacting, Sent E-Sign, Signed E-Sign, Client Refused Help, Case Rejected)' }, { status: 400 })
      }

      if ((outcome_status === 'Client Refused Help' || outcome_status === 'Case Rejected') && !outcome_reason) {
        return NextResponse.json({ error: 'Outcome reason is mandatory when Client Refused Help or Case Rejected' }, { status: 400 })
      }

      let linkedLeadId = existing.linked_lead_record_id || null

      // Automatically sync or create record in va_lead_records if outcome is Sent E-Sign, Signed E-Sign, CRH, or Rejected
      if (['Sent E-Sign', 'Signed E-Sign', 'Client Refused Help', 'Case Rejected'].includes(outcome_status)) {
        const todayStr = getBusinessDate(new Date())

        if (linkedLeadId) {
          // Update existing linked lead
          db.prepare(`
            UPDATE va_lead_records
            SET status = ?,
                outcome_reason = ?,
                other_reason_notes = ?,
                signed_at = ?,
                updated_at = datetime('now'),
                last_edited_by = ?
            WHERE id = ?
          `).run(
            outcome_status,
            outcome_reason || null,
            other_reason_notes || existing.notes || null,
            outcome_status === 'Signed E-Sign' ? `${todayStr} 12:00:00` : null,
            sessionDisplayName,
            linkedLeadId
          )
        } else {
          // Create new record in va_lead_records
          const leadInsert = db.prepare(`
            INSERT INTO va_lead_records (
              rep_name, rep_username, veteran_name, lead_id, date,
              status, outcome_reason, other_reason_notes, signed_at,
              phone_number, scheduled_callback_id, created_at, updated_at, last_edited_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
          `).run(
            existing.rep_name,
            existing.rep_username,
            existing.veteran_name,
            existing.lead_id || null,
            todayStr,
            outcome_status,
            outcome_reason || null,
            other_reason_notes || existing.notes || null,
            outcome_status === 'Signed E-Sign' ? `${todayStr} 12:00:00` : null,
            existing.phone_number || null,
            existing.id,
            sessionDisplayName
          )
          linkedLeadId = Number(leadInsert.lastInsertRowid)
        }
      }

      // Update callback record
      db.prepare(`
        UPDATE va_scheduled_callbacks
        SET status = 'COMPLETED',
            outcome_status = ?,
            outcome_reason = ?,
            other_reason_notes = ?,
            resolved_at = datetime('now'),
            resolved_by = ?,
            linked_lead_record_id = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        outcome_status,
        outcome_reason || null,
        other_reason_notes ? sanitizeCellText(other_reason_notes) : null,
        sessionDisplayName,
        linkedLeadId,
        id
      )

      return NextResponse.json({
        success: true,
        message: `Callback marked as completed with outcome: ${outcome_status}`,
        outcome_status,
        linked_lead_id: linkedLeadId,
      })
    }

    // 2. ACTION: RESCHEDULE CALLBACK
    if (action === 'reschedule') {
      const { callback_date, callback_time, notes } = body
      if (!callback_date || !callback_time) {
        return NextResponse.json({ error: 'New callback date and time are required to reschedule' }, { status: 400 })
      }

      const scheduledDatetime = `${callback_date} ${callback_time}:00`
      const appendNote = notes ? `[Rescheduled on ${new Date().toLocaleDateString()}]: ${notes}` : ''
      const updatedNotes = existing.notes ? `${existing.notes}\n${appendNote}`.trim() : appendNote

      db.prepare(`
        UPDATE va_scheduled_callbacks
        SET callback_date = ?,
            callback_time = ?,
            scheduled_datetime = ?,
            notes = ?,
            status = 'PENDING',
            updated_at = datetime('now')
        WHERE id = ?
      `).run(callback_date, callback_time, scheduledDatetime, updatedNotes, id)

      return NextResponse.json({
        success: true,
        message: `Callback rescheduled to ${callback_date} at ${callback_time}`,
      })
    }

    // 3. ACTION: EDIT DETAILS
    if (action === 'edit') {
      const {
        veteran_name,
        lead_id,
        phone_number,
        callback_date,
        callback_time,
        notes,
      } = body

      const scheduledDatetime = `${callback_date || existing.callback_date} ${callback_time || existing.callback_time}:00`

      db.prepare(`
        UPDATE va_scheduled_callbacks
        SET veteran_name = ?,
            lead_id = ?,
            phone_number = ?,
            callback_date = ?,
            callback_time = ?,
            scheduled_datetime = ?,
            notes = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        veteran_name ? sanitizeCellText(veteran_name) : existing.veteran_name,
        lead_id !== undefined ? (lead_id ? sanitizeCellText(lead_id) : null) : existing.lead_id,
        phone_number !== undefined ? (phone_number ? sanitizeCellText(phone_number) : null) : existing.phone_number,
        callback_date || existing.callback_date,
        callback_time || existing.callback_time,
        scheduledDatetime,
        notes !== undefined ? (notes ? sanitizeCellText(notes) : null) : existing.notes,
        id
      )

      return NextResponse.json({ success: true, message: 'Callback updated successfully' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('[va-tracker/callbacks PUT error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/va-tracker/callbacks?id=123 — Remove a callback
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Callback ID is required' }, { status: 400 })
    }

    const db = getDb()
    const isMaster = isAuthorizedVaTeamLead(session)
    const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'va_user'
    const sessionDisplayName = session.user?.name || 'VA Specialist'

    const existing = db.prepare('SELECT * FROM va_scheduled_callbacks WHERE id = ?').get(id) as any
    if (!existing) {
      return NextResponse.json({ error: 'Callback not found' }, { status: 404 })
    }

    if (!isMaster) {
      const isOwner =
        existing.rep_username?.toLowerCase() === sessionUsername.toLowerCase() ||
        existing.rep_name?.toLowerCase() === sessionDisplayName.toLowerCase()
      if (!isOwner) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    db.prepare('DELETE FROM va_scheduled_callbacks WHERE id = ?').run(id)

    return NextResponse.json({ success: true, message: 'Callback removed successfully' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
