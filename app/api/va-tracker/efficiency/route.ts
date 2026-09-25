import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { isAuthorizedForVaTracker, isAuthorizedVaTeamLead } from '../route'
import { sanitizeCellText } from '@/lib/security'
import { getBusinessDate } from '@/lib/dateUtils'

// Helper to re-evaluate compliance badges
export function evaluateCompliance(record: {
  wrap_up_time_sec: number
  busy_time_sec: number
  total_calls_handled: number
  is_narrative_rep: number
  is_onboarding_rep: number
  meeting_credit_sec: number
  exception_status: string
}) {
  // 1. Wrap-Up Compliance:
  // Evaluated on average wrap-up velocity per call rather than raw daily total.
  // Standard Reps: Target <= 90s (Compliant), 91s - 120s (Warning), > 120s (Violation / Outlier).
  // Onboarding Reps: Target <= 120s (Compliant), 121s - 150s (Warning), > 150s (Violation / Outlier).
  // Low-Volume Protection: Reps with fewer than 15 calls and <= 45 min total wrap-up (2,700s) are protected from outlier penalties.
  let wrapUpStatus = 'COMPLIANT'
  if (record.exception_status === 'APPROVED_EXCEPTION') {
    wrapUpStatus = 'EXCUSED'
  } else {
    const totalCalls = record.total_calls_handled || 0
    const avgWrapUp = totalCalls > 0 ? (record.wrap_up_time_sec / totalCalls) : 0
    const isOnboarding = record.is_onboarding_rep === 1

    const targetSec = isOnboarding ? 120 : 90
    const warningMaxSec = isOnboarding ? 150 : 120

    // Low call volume safeguard floor: if fewer than 15 calls handled and total wrap-up is <= 45 min, protect from outlier penalty
    const isLowVolumeProtected = totalCalls < 15 && record.wrap_up_time_sec <= 2700

    if (isLowVolumeProtected) {
      wrapUpStatus = 'COMPLIANT'
    } else if (avgWrapUp > warningMaxSec) {
      wrapUpStatus = 'VIOLATION'
    } else if (avgWrapUp > targetSec) {
      wrapUpStatus = 'WARNING'
    } else {
      wrapUpStatus = 'COMPLIANT'
    }
  }

  // 2. Busy Compliance:
  // Base budget: 30 mins (1,800s) for standard reps; 2.5 hours (9,000s) for Narrative Reps.
  // Plus any approved meeting credits!
  let busyStatus = 'COMPLIANT'
  if (record.exception_status === 'APPROVED_EXCEPTION') {
    busyStatus = 'EXCUSED'
  } else {
    const baseBudgetSec = record.is_narrative_rep ? 9000 : 1800 // 2.5h (150m) vs 30m
    const totalAllowedSec = baseBudgetSec + (record.meeting_credit_sec || 0)
    const warningThresholdSec = Math.round(totalAllowedSec * 0.85)

    if (record.busy_time_sec > totalAllowedSec) {
      busyStatus = 'VIOLATION'
    } else if (record.busy_time_sec >= warningThresholdSec) {
      busyStatus = 'WARNING'
    }
  }

  return { wrapUpStatus, busyStatus }
}

// GET /api/va-tracker/efficiency — Retrieve dialer efficiency records & team summary
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedForVaTracker(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const search = searchParams.get('search')
    const statusFilter = searchParams.get('status') // 'all' | 'compliant' | 'violation' | 'warning' | 'excused'
    const repFilter = searchParams.get('rep')

    const db = getDb()
    const userRole = (session.user as any)?.role || 'regular'
    const currentUsername = (session.user as any)?.email || (session.user as any)?.username || ''
    const currentDisplayName = session.user?.name || ''
    const isMaster = isAuthorizedVaTeamLead(session)

    let scopeSql = ''
    const scopeParams: any[] = []

    // Regular VA intake reps only view their own records
    if (!isMaster && userRole === 'regular') {
      scopeSql = ` AND (LOWER(TRIM(agent_username)) = LOWER(TRIM(?)) OR LOWER(TRIM(agent_name)) = LOWER(TRIM(?)))`
      scopeParams.push(currentUsername, currentDisplayName)
    } else if (repFilter && repFilter !== 'All') {
      scopeSql = ` AND (LOWER(TRIM(agent_username)) = LOWER(TRIM(?)) OR LOWER(TRIM(agent_name)) = LOWER(TRIM(?)))`
      scopeParams.push(repFilter, repFilter)
    }

    let dateSql = ''
    const dateParams: any[] = []

    if (from && to) {
      dateSql = ` AND date >= ? AND date <= ?`
      dateParams.push(from, to)
    } else if (date) {
      dateSql = ` AND date = ?`
      dateParams.push(date)
    } else {
      // Default: latest date in DB or today
      const latestRow = db.prepare(`SELECT MAX(date) as latestDate FROM va_dialer_efficiency_records WHERE 1=1 ${scopeSql}`).get(...scopeParams) as any
      const effectiveDate = latestRow?.latestDate || getBusinessDate(new Date())
      dateSql = ` AND date = ?`
      dateParams.push(effectiveDate)
    }

    let filterSql = ''
    const filterParams: any[] = []

    if (search && search.trim()) {
      filterSql += ` AND (agent_name LIKE ? OR agent_username LIKE ?)`
      const s = `%${search.trim()}%`
      filterParams.push(s, s)
    }

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'violation') {
        filterSql += ` AND (wrap_up_status = 'VIOLATION' OR busy_status = 'VIOLATION')`
      } else if (statusFilter === 'compliant') {
        filterSql += ` AND (wrap_up_status = 'COMPLIANT' AND busy_status = 'COMPLIANT')`
      } else if (statusFilter === 'warning') {
        filterSql += ` AND (wrap_up_status = 'WARNING' OR busy_status = 'WARNING')`
      } else if (statusFilter === 'excused') {
        filterSql += ` AND (exception_status = 'APPROVED_EXCEPTION' OR wrap_up_status = 'EXCUSED' OR busy_status = 'EXCUSED')`
      } else if (statusFilter === 'narrative') {
        filterSql += ` AND is_narrative_rep = 1`
      }
    }

    const query = `
      SELECT * FROM va_dialer_efficiency_records
      WHERE 1=1
        ${scopeSql}
        ${dateSql}
        ${filterSql}
      ORDER BY 
        CASE 
          WHEN wrap_up_status = 'VIOLATION' OR busy_status = 'VIOLATION' THEN 1
          WHEN wrap_up_status = 'WARNING' OR busy_status = 'WARNING' THEN 2
          ELSE 3
        END ASC,
        calls_made DESC
    `

    const records = db.prepare(query).all(...scopeParams, ...dateParams, ...filterParams) as any[]

    // Summary calculations across the queried records
    let totalCallsHandled = 0
    let totalTalkSec = 0
    let totalWrapUpSec = 0
    let totalBusySec = 0
    let totalAvailableSec = 0
    let totalOfflineSec = 0
    let compliantCount = 0
    let violationCount = 0
    let warningCount = 0
    let excusedCount = 0

    records.forEach((r) => {
      totalCallsHandled += r.total_calls_handled || 0
      totalTalkSec += r.total_talk_time_sec || 0
      totalWrapUpSec += r.wrap_up_time_sec || 0
      totalBusySec += r.busy_time_sec || 0
      totalAvailableSec += r.time_available_sec || 0
      totalOfflineSec += r.offline_time_sec || 0

      if (r.exception_status === 'APPROVED_EXCEPTION') {
        excusedCount++
      } else if (r.wrap_up_status === 'VIOLATION' || r.busy_status === 'VIOLATION') {
        violationCount++
      } else if (r.wrap_up_status === 'WARNING' || r.busy_status === 'WARNING') {
        warningCount++
      } else {
        compliantCount++
      }
    })

    const n = records.length
    const summary = {
      total_specialists: n,
      total_calls_handled: totalCallsHandled,
      avg_talk_time_sec: n > 0 ? Math.round(totalTalkSec / n) : 0,
      avg_wrap_up_time_sec: n > 0 ? Math.round(totalWrapUpSec / n) : 0,
      avg_busy_time_sec: n > 0 ? Math.round(totalBusySec / n) : 0,
      avg_wrap_up_per_call_sec: totalCallsHandled > 0 ? Math.round(totalWrapUpSec / totalCallsHandled) : 0,
      compliant_count: compliantCount,
      violation_count: violationCount,
      warning_count: warningCount,
      excused_count: excusedCount,
      adherence_rate: n > 0 ? Math.round(((compliantCount + excusedCount) / n) * 100) : 100,
    }

    return NextResponse.json({
      records,
      summary,
      selectedDate: date || (dateParams.length > 0 ? dateParams[0] : null),
    })
  } catch (err: any) {
    console.error('[va-tracker/efficiency GET error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/va-tracker/efficiency — Exception Approval, Meeting Credits & Status Toggles
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedVaTeamLead(session)) {
      return NextResponse.json({ error: 'Forbidden: Team Lead / Admin access required' }, { status: 403 })
    }

    const body = await req.json()
    const { action, id, date } = body
    const db = getDb()
    const sessionDisplayName = session.user?.name || 'Administrator'

    // 1. ACTION: APPROVE EXCEPTION (From Microsoft Form or Technical Outage)
    if (action === 'approve_exception') {
      const { exception_reason } = body
      if (!id) return NextResponse.json({ error: 'Record ID is required' }, { status: 400 })

      db.prepare(`
        UPDATE va_dialer_efficiency_records
        SET exception_status = 'APPROVED_EXCEPTION',
            exception_reason = ?,
            exception_reviewed_by = ?,
            exception_reviewed_at = datetime('now'),
            wrap_up_status = CASE WHEN wrap_up_status = 'VIOLATION' THEN 'EXCUSED' ELSE wrap_up_status END,
            busy_status = CASE WHEN busy_status = 'VIOLATION' THEN 'EXCUSED' ELSE busy_status END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(
        sanitizeCellText(exception_reason || 'Exception Form Approved'),
        sessionDisplayName,
        id
      )

      return NextResponse.json({ success: true, message: 'Exception approved successfully' })
    }

    // 2. ACTION: ADD MEETING CREDIT
    if (action === 'add_meeting_credit') {
      const { credit_minutes, meeting_notes, apply_all } = body
      if (!credit_minutes || credit_minutes <= 0) {
        return NextResponse.json({ error: 'Valid meeting credit minutes required' }, { status: 400 })
      }

      const creditSec = Math.round(Number(credit_minutes) * 60)
      const notes = sanitizeCellText(meeting_notes || `Meeting credit: +${credit_minutes}m`)

      if (apply_all && date) {
        // Apply team-wide meeting credit to all VA records for this date
        const targetRecords = db.prepare(`SELECT * FROM va_dialer_efficiency_records WHERE date = ?`).all(date) as any[]

        for (const rec of targetRecords) {
          const newCreditSec = (rec.meeting_credit_sec || 0) + creditSec
          const mergedNotes = rec.meeting_notes ? `${rec.meeting_notes}; ${notes}` : notes

          const { busyStatus } = evaluateCompliance({
            ...rec,
            meeting_credit_sec: newCreditSec,
          })

          db.prepare(`
            UPDATE va_dialer_efficiency_records
            SET meeting_credit_sec = ?,
                meeting_notes = ?,
                busy_status = ?,
                updated_at = datetime('now')
            WHERE id = ?
          `).run(newCreditSec, mergedNotes, busyStatus, rec.id)
        }

        return NextResponse.json({
          success: true,
          message: `Team meeting credit of +${credit_minutes}m applied to ${targetRecords.length} specialists for ${date}`,
        })
      } else if (id) {
        // Apply to single individual record
        const rec = db.prepare(`SELECT * FROM va_dialer_efficiency_records WHERE id = ?`).get(id) as any
        if (!rec) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

        const newCreditSec = (rec.meeting_credit_sec || 0) + creditSec
        const mergedNotes = rec.meeting_notes ? `${rec.meeting_notes}; ${notes}` : notes

        const { busyStatus } = evaluateCompliance({
          ...rec,
          meeting_credit_sec: newCreditSec,
        })

        db.prepare(`
          UPDATE va_dialer_efficiency_records
          SET meeting_credit_sec = ?,
              meeting_notes = ?,
              busy_status = ?,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(newCreditSec, mergedNotes, busyStatus, id)

        return NextResponse.json({ success: true, message: `Meeting credit of +${credit_minutes}m applied` })
      } else {
        return NextResponse.json({ error: 'Either ID or date with apply_all is required' }, { status: 400 })
      }
    }

    // 3. ACTION: TOGGLE NARRATIVE PROJECT STATUS (Changes busy allowance to 2.5h)
    if (action === 'toggle_narrative') {
      if (!id) return NextResponse.json({ error: 'Record ID required' }, { status: 400 })
      const rec = db.prepare(`SELECT * FROM va_dialer_efficiency_records WHERE id = ?`).get(id) as any
      if (!rec) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

      const newNarrative = rec.is_narrative_rep ? 0 : 1
      const { busyStatus } = evaluateCompliance({
        ...rec,
        is_narrative_rep: newNarrative,
      })

      db.prepare(`
        UPDATE va_dialer_efficiency_records
        SET is_narrative_rep = ?,
            busy_status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(newNarrative, busyStatus, id)

      return NextResponse.json({
        success: true,
        is_narrative_rep: newNarrative,
        message: newNarrative ? 'Assigned to Narrative Project (2.5h Busy Allowance)' : 'Removed from Narrative Project (30m Busy Allowance)',
      })
    }

    // 4. ACTION: TOGGLE ONBOARDING STATUS
    if (action === 'toggle_onboarding') {
      if (!id) return NextResponse.json({ error: 'Record ID required' }, { status: 400 })
      const rec = db.prepare(`SELECT * FROM va_dialer_efficiency_records WHERE id = ?`).get(id) as any
      if (!rec) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

      const newOnboarding = rec.is_onboarding_rep ? 0 : 1
      const { wrapUpStatus } = evaluateCompliance({
        ...rec,
        is_onboarding_rep: newOnboarding,
      })

      db.prepare(`
        UPDATE va_dialer_efficiency_records
        SET is_onboarding_rep = ?,
            wrap_up_status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(newOnboarding, wrapUpStatus, id)

      return NextResponse.json({ success: true, is_onboarding_rep: newOnboarding })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('[va-tracker/efficiency PATCH error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
