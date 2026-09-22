import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'
import { validateFileUpload, sanitizeCellText, recordUploadAudit } from '@/lib/security'
import { isAuthorizedVaTeamLead } from '../../route'
import { normalizeAgentName } from '@/app/api/call-report/import/route'
import { evaluateCompliance } from '../route'
import { getBusinessDate } from '@/lib/dateUtils'

// Converts "HH:mm:ss" or numeric Excel day fraction into integer seconds
function parseTimeToSeconds(val: any): number {
  if (val === null || val === undefined || val === '') return 0

  if (typeof val === 'number') {
    // Excel stores time as fraction of day (0.5 = 12 hours = 43200s)
    return Math.round(val * 86400)
  }

  const s = String(val).trim()
  // Format "D.HH:mm:ss" e.g. "3.09:21:03"
  const dayMatch = s.match(/^(\d+)\.(\d{1,2}):(\d{2}):(\d{2})$/)
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10)
    const hours = parseInt(dayMatch[2], 10)
    const mins = parseInt(dayMatch[3], 10)
    const secs = parseInt(dayMatch[4], 10)
    return days * 86400 + hours * 3600 + mins * 60 + secs
  }

  // Format "HH:mm:ss"
  const match = s.match(/^(\d{1,3}):(\d{2}):(\d{2})$/)
  if (match) {
    const hours = parseInt(match[1], 10)
    const mins = parseInt(match[2], 10)
    const secs = parseInt(match[3], 10)
    return hours * 3600 + mins * 60 + secs
  }

  // Format "mm:ss"
  const shortMatch = s.match(/^(\d{1,2}):(\d{2})$/)
  if (shortMatch) {
    return parseInt(shortMatch[1], 10) * 60 + parseInt(shortMatch[2], 10)
  }

  return 0
}

// Converts seconds back to clean "HH:mm:ss" string
function formatSecondsToHms(totalSec: number): string {
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

// Parses date from Law Ruler header e.g. "Date Range: from 09/21/2026 00:00 CST to 09/21/2026 00:00 CST"
function extractDateFromReport(rows: any[][]): string {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const rowStr = (rows[i] || []).join(' ')
    const dateMatch = rowStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
    if (dateMatch) {
      const month = dateMatch[1].padStart(2, '0')
      const day = dateMatch[2].padStart(2, '0')
      const year = dateMatch[3]
      return `${year}-${month}-${day}`
    }
  }
  return getBusinessDate(new Date())
}

// Calculates the Monday start of the week for a given YYYY-MM-DD
function getWeekStartDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const day = dt.getDay()
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  const monday = new Date(dt.setDate(diff))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAuthorizedVaTeamLead(session)) {
    return NextResponse.json({ error: 'Forbidden: Admin or Team Lead access required' }, { status: 403 })
  }

  const db = getDb()
  const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'admin'
  const sessionDisplayName = session.user?.name || 'Administrator'

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const customDate = formData.get('date') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    // Validate file
    const validation = validateFileUpload(buffer, file.name, {
      maxSizeBytes: 15 * 1024 * 1024,
      allowedTypes: ['xlsx', 'xls'],
    })

    if (!validation.isValid) {
      recordUploadAudit({
        username: sessionUsername,
        userName: sessionDisplayName,
        uploadType: 'call_report',
        filename: file.name,
        buffer,
        rowsProcessed: 0,
        status: 'REJECTED',
        details: validation.error,
      })
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('agent') || n.toLowerCase().includes('metric')) || workbook.SheetNames[0]
    const ws = workbook.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

    if (rows.length < 5) {
      return NextResponse.json({ error: 'Spreadsheet has insufficient rows or invalid format' }, { status: 400 })
    }

    // 1. Resolve Date
    const reportDate = customDate && customDate.match(/^\d{4}-\d{2}-\d{2}$/) ? customDate : extractDateFromReport(rows)
    const weekStart = getWeekStartDate(reportDate)

    // 2. Locate Header Row
    let headerIdx = -1
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = (rows[i] || []).map(cell => String(cell || '').toLowerCase().trim())
      if (row.includes('agent') && (row.some(c => c.includes('talk')) || row.some(c => c.includes('wrap')))) {
        headerIdx = i
        break
      }
    }

    if (headerIdx === -1) {
      return NextResponse.json({ error: 'Could not find header row (Agent, Talk Time, Wrap-Up Time, Time on Busy)' }, { status: 400 })
    }

    const header = rows[headerIdx].map(cell => String(cell || '').toLowerCase().trim())
    const colIdx = {
      agent: header.findIndex(c => c === 'agent' || c === 'agent name' || c === 'specialist'),
      avgTalk: header.findIndex(c => c.includes('average talk') || c.includes('avg talk')),
      totalTalk: header.findIndex(c => c.includes('total talk') || c === 'talk time'),
      available: header.findIndex(c => c.includes('available')),
      wrapUp: header.findIndex(c => c.includes('wrap-up') || c.includes('wrap up')),
      busy: header.findIndex(c => c.includes('busy')),
      offline: header.findIndex(c => c.includes('offline')),
      inboundTalk: header.findIndex(c => c.includes('inbound talk')),
      outboundTalk: header.findIndex(c => c.includes('outbound talk')),
      callsMade: header.findIndex(c => c.includes('calls made') || c.includes('outbound calls')),
      callsReceived: header.findIndex(c => c.includes('calls received') || c.includes('inbound calls')),
      callsRecycled: header.findIndex(c => c.includes('recycled')),
      callsDeclined: header.findIndex(c => c.includes('declined')),
      callsMissed: header.findIndex(c => c.includes('missed')),
    }

    if (colIdx.agent === -1 || colIdx.wrapUp === -1 || colIdx.busy === -1) {
      return NextResponse.json({ error: 'Missing required columns: Agent, Wrap-Up Time, or Time on Busy' }, { status: 400 })
    }

    // Load active VA agents and weekly Narrative assignments
    const activeAgents = (db.prepare(`SELECT name FROM agents WHERE active = 1 AND lob = 'VA'`).all() as any[]).map(a => a.name)
    const narrativeRoster = (db.prepare(`SELECT agent_name FROM va_dialer_narrative_assignments WHERE week_start_date = ?`).all(weekStart) as any[]).map(a => a.agent_name.toLowerCase().trim())

    let rowsProcessed = 0
    const insertedRecords: any[] = []

    const upsertStmt = db.prepare(`
      INSERT INTO va_dialer_efficiency_records (
        date, agent_name, agent_username, lob,
        avg_talk_time, total_talk_time_sec, time_available_sec, wrap_up_time_sec,
        busy_time_sec, offline_time_sec, inbound_talk_time_sec, outbound_talk_time_sec,
        calls_made, calls_received, calls_recycled, calls_declined, calls_missed,
        total_calls_handled, avg_wrap_up_per_call_sec,
        is_narrative_rep, is_onboarding_rep, meeting_credit_sec, meeting_notes,
        exception_status, wrap_up_status, busy_status, raw_date_range,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, 'VA',
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?,
        'NONE', ?, ?, ?,
        datetime('now'), datetime('now')
      )
      ON CONFLICT(date, agent_name) DO UPDATE SET
        agent_username = excluded.agent_username,
        avg_talk_time = excluded.avg_talk_time,
        total_talk_time_sec = excluded.total_talk_time_sec,
        time_available_sec = excluded.time_available_sec,
        wrap_up_time_sec = excluded.wrap_up_time_sec,
        busy_time_sec = excluded.busy_time_sec,
        offline_time_sec = excluded.offline_time_sec,
        inbound_talk_time_sec = excluded.inbound_talk_time_sec,
        outbound_talk_time_sec = excluded.outbound_talk_time_sec,
        calls_made = excluded.calls_made,
        calls_received = excluded.calls_received,
        calls_recycled = excluded.calls_recycled,
        calls_declined = excluded.calls_declined,
        calls_missed = excluded.calls_missed,
        total_calls_handled = excluded.total_calls_handled,
        avg_wrap_up_per_call_sec = excluded.avg_wrap_up_per_call_sec,
        is_narrative_rep = excluded.is_narrative_rep,
        wrap_up_status = CASE WHEN va_dialer_efficiency_records.exception_status = 'APPROVED_EXCEPTION' THEN 'EXCUSED' ELSE excluded.wrap_up_status END,
        busy_status = CASE WHEN va_dialer_efficiency_records.exception_status = 'APPROVED_EXCEPTION' THEN 'EXCUSED' ELSE excluded.busy_status END,
        updated_at = datetime('now')
    `)

    // Process data rows
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      const rawAgent = String(row[colIdx.agent] || '').trim()
      if (!rawAgent || rawAgent.toLowerCase().includes('total for all') || rawAgent.toLowerCase().includes('total')) {
        continue
      }

      const normalizedName = normalizeAgentName(rawAgent, activeAgents)
      const u = db.prepare(`SELECT username FROM users WHERE (LOWER(TRIM(display_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(username)) = LOWER(TRIM(?))) AND active = 1`).get(normalizedName, normalizedName) as any
      const agentUsername = u?.username || normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '')

      const avgTalkStr = String(row[colIdx.avgTalk] || '00:00:00')
      const totalTalkSec = parseTimeToSeconds(row[colIdx.totalTalk])
      const availableSec = parseTimeToSeconds(row[colIdx.available])
      const wrapUpSec = parseTimeToSeconds(row[colIdx.wrapUp])
      const busySec = parseTimeToSeconds(row[colIdx.busy])
      const offlineSec = parseTimeToSeconds(row[colIdx.offline])
      const inboundTalkSec = colIdx.inboundTalk !== -1 ? parseTimeToSeconds(row[colIdx.inboundTalk]) : 0
      const outboundTalkSec = colIdx.outboundTalk !== -1 ? parseTimeToSeconds(row[colIdx.outboundTalk]) : 0

      const callsMade = colIdx.callsMade !== -1 ? parseInt(String(row[colIdx.callsMade] || '0'), 10) || 0 : 0
      const callsReceived = colIdx.callsReceived !== -1 ? parseInt(String(row[colIdx.callsReceived] || '0'), 10) || 0 : 0
      const callsRecycled = colIdx.callsRecycled !== -1 ? parseInt(String(row[colIdx.callsRecycled] || '0'), 10) || 0 : 0
      const callsDeclined = colIdx.callsDeclined !== -1 ? parseInt(String(row[colIdx.callsDeclined] || '0'), 10) || 0 : 0
      const callsMissed = colIdx.callsMissed !== -1 ? parseInt(String(row[colIdx.callsMissed] || '0'), 10) || 0 : 0

      const totalCallsHandled = callsMade + callsReceived
      const avgWrapUpPerCallSec = totalCallsHandled > 0 ? Math.round(wrapUpSec / totalCallsHandled) : 0

      // Check if Narrative rep for this week (automatically gives 2.5h allowance)
      const isNarrative = narrativeRoster.includes(normalizedName.toLowerCase()) ? 1 : 0

      // Check existing record for any previously added meeting credits
      const existing = db.prepare(`SELECT meeting_credit_sec, meeting_notes, is_onboarding_rep, exception_status FROM va_dialer_efficiency_records WHERE date = ? AND agent_name = ?`).get(reportDate, normalizedName) as any
      const meetingCreditSec = existing?.meeting_credit_sec || 0
      const meetingNotes = existing?.meeting_notes || null
      const isOnboarding = existing?.is_onboarding_rep || 0
      const exceptionStatus = existing?.exception_status || 'NONE'

      const { wrapUpStatus, busyStatus } = evaluateCompliance({
        wrap_up_time_sec: wrapUpSec,
        busy_time_sec: busySec,
        total_calls_handled: totalCallsHandled,
        is_narrative_rep: isNarrative,
        is_onboarding_rep: isOnboarding,
        meeting_credit_sec: meetingCreditSec,
        exception_status: exceptionStatus,
      })

      upsertStmt.run(
        reportDate,
        normalizedName,
        agentUsername,
        avgTalkStr,
        totalTalkSec,
        availableSec,
        wrapUpSec,
        busySec,
        offlineSec,
        inboundTalkSec,
        outboundTalkSec,
        callsMade,
        callsReceived,
        callsRecycled,
        callsDeclined,
        callsMissed,
        totalCallsHandled,
        avgWrapUpPerCallSec,
        isNarrative,
        isOnboarding,
        meetingCreditSec,
        meetingNotes,
        wrapUpStatus,
        busyStatus,
        file.name
      )

      rowsProcessed++
      insertedRecords.push({
        agent_name: normalizedName,
        calls_handled: totalCallsHandled,
        wrap_up_time: formatSecondsToHms(wrapUpSec),
        avg_wrap_up_per_call: `${avgWrapUpPerCallSec}s`,
        busy_time: formatSecondsToHms(busySec),
        is_narrative: isNarrative,
        wrap_up_status: wrapUpStatus,
        busy_status: busyStatus,
      })
    }

    recordUploadAudit({
      username: sessionUsername,
      userName: sessionDisplayName,
      uploadType: 'call_report',
      filename: file.name,
      buffer,
      rowsProcessed,
      status: 'SUCCESS',
      details: `Imported Law Ruler dialer metrics for ${rowsProcessed} specialists on ${reportDate}`,
    })

    return NextResponse.json({
      success: true,
      reportDate,
      rowsProcessed,
      records: insertedRecords,
      message: `Successfully processed ${rowsProcessed} intake specialists for ${reportDate}!`,
    })
  } catch (err: any) {
    console.error('[va-tracker/efficiency/import POST error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
