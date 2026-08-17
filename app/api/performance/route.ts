import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/performance?from=YYYY-MM-DD&to=YYYY-MM-DD&agent=name&lob=LOB
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || '2020-01-01'
  const to = searchParams.get('to') || '2099-12-31'
  const agent = searchParams.get('agent') || null
  const lob = searchParams.get('lob') || null

  const db = getDb()
  const userRole = (session.user as any)?.role || 'regular'
  const userLob = (session.user as any)?.lob || 'VA'

  let query = `
    SELECT dp.*, u.lob 
    FROM daily_performance dp
    INNER JOIN users u ON (LOWER(TRIM(dp.agent_name)) = LOWER(TRIM(u.display_name)) OR LOWER(TRIM(dp.agent_name)) = LOWER(TRIM(u.username)))
    WHERE dp.date >= ? AND dp.date <= ?
      AND u.role = 'regular'
      AND u.active = 1
  `
  const params: any[] = [from, to]

  if (agent) {
    query += ` AND (dp.agent_name = ? OR u.display_name = ? OR u.username = ?)`
    params.push(agent, agent, agent)
  }

  // Enforce LOB filter: regular users are locked to their own LOB.
  // Master admins can request a specific LOB or get all if they request 'All' or no lob parameter.
  if (userRole === 'regular') {
    query += ` AND u.lob = ?`
    params.push(userLob)
  } else if (lob && lob !== 'All') {
    query += ` AND u.lob = ?`
    params.push(lob)
  }

  query += ` ORDER BY dp.date ASC, dp.agent_name ASC`

  const rows = db.prepare(query).all(...params) as any[]

  // Dynamically enhance VA specialist performance with live va_lead_records
  const enhancedRows = rows.map((row) => {
    if (row.lob === 'VA') {
      const leads = db.prepare(`
        SELECT status FROM va_lead_records 
        WHERE date = ? AND (LOWER(rep_name) = LOWER(?) OR rep_username = ?)
      `).all(row.date, row.agent_name, row.agent_name) as { status: string }[]

      if (leads.length > 0) {
        const signed = leads.filter((l) => l.status === 'Signed E-Sign').length
        const unsigned = leads.filter((l) => l.status === 'Sent E-Sign' || l.status === 'Sign Follow Up').length
        const crh = leads.filter((l) => l.status === 'Client Refused Help').length
        const rejected = leads.filter((l) => l.status === 'Case Rejected').length
        const total = signed + unsigned

        return {
          ...row,
          signed_retainers: signed,
          unsigned_retainers: unsigned,
          crh: crh,
          case_rejected: rejected,
          total_case_wanted: total,
          signed_success_rate: total > 0 ? signed / total : 0,
        }
      }
    }
    return row
  })

  // Check for any VA leads logged on dates without a daily_performance row yet
  if ((!lob || lob === 'VA' || lob === 'All') && (userRole !== 'regular' || userLob === 'VA')) {
    const existingKeys = new Set(enhancedRows.map((r) => `${r.date}___${r.agent_name.toLowerCase()}`))

    let leadsQuery = `
      SELECT vlr.date, vlr.rep_name as agent_name, vlr.status, u.lob
      FROM va_lead_records vlr
      INNER JOIN users u ON (LOWER(TRIM(vlr.rep_name)) = LOWER(TRIM(u.display_name)) OR LOWER(TRIM(vlr.rep_username)) = LOWER(TRIM(u.username)))
      WHERE vlr.date >= ? AND vlr.date <= ? AND u.role = 'regular' AND u.active = 1 AND u.lob = 'VA'
    `
    const leadsParams: any[] = [from, to]
    if (agent) {
      leadsQuery += ` AND (vlr.rep_name = ? OR vlr.rep_username = ? OR u.display_name = ?)`
      leadsParams.push(agent, agent, agent)
    }

    const unmappedLeads = db.prepare(leadsQuery).all(...leadsParams) as any[]
    const unmappedGroups: Record<string, { date: string; agent_name: string; lob: string; leads: string[] }> = {}

    for (const item of unmappedLeads) {
      const key = `${item.date}___${item.agent_name.toLowerCase()}`
      if (!existingKeys.has(key)) {
        if (!unmappedGroups[key]) {
          unmappedGroups[key] = {
            date: item.date,
            agent_name: item.agent_name,
            lob: 'VA',
            leads: [],
          }
        }
        unmappedGroups[key].leads.push(item.status)
      }
    }

    for (const group of Object.values(unmappedGroups)) {
      const signed = group.leads.filter((st) => st === 'Signed E-Sign').length
      const unsigned = group.leads.filter((st) => st === 'Sent E-Sign' || st === 'Sign Follow Up').length
      const crh = group.leads.filter((st) => st === 'Client Refused Help').length
      const rejected = group.leads.filter((st) => st === 'Case Rejected').length
      const total = signed + unsigned

      enhancedRows.push({
        id: `synth-${group.date}-${group.agent_name}`,
        date: group.date,
        agent_name: group.agent_name,
        lob: 'VA',
        capd: 0,
        inbound_calls: 0,
        case_rejected: rejected,
        crh: crh,
        signed_retainers: signed,
        unsigned_retainers: unsigned,
        converted_cases: 0,
        rfc_sent: 0,
        total_case_wanted: total,
        signed_success_rate: total > 0 ? signed / total : 0,
        week_label: '',
        present: 'SI',
        ura: 0,
        reprocess: 0,
      })
    }
  }

  enhancedRows.sort((a, b) => a.date.localeCompare(b.date) || a.agent_name.localeCompare(b.agent_name))

  return NextResponse.json(enhancedRows)
}

// POST /api/performance  — daily entry
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const perms = (session?.user as any)?.permissions
  const isAllowed = role === 'master' || role === 'superadmin' || (role === 'admin' && (perms?.canManageDailyEntry ?? true))
  if (!session || !isAllowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { date, entries } = body // entries: array of per-agent objects

  if (!date || !Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const db = getDb()

  const insert = db.prepare(`
    INSERT INTO daily_performance (
      date, agent_name, capd, inbound_calls, case_rejected, crh,
      signed_retainers, unsigned_retainers, converted_cases, rfc_sent, total_case_wanted,
      signed_success_rate, week_label, present, ura, reprocess
    ) VALUES (
      @date, @agent_name, @capd, @inbound_calls, @case_rejected, @crh,
      @signed_retainers, @unsigned_retainers, @converted_cases, @rfc_sent, @total_case_wanted,
      @signed_success_rate, @week_label, @present, @ura, @reprocess
    )
    ON CONFLICT(date, agent_name) DO UPDATE SET
      capd = excluded.capd,
      inbound_calls = excluded.inbound_calls,
      case_rejected = excluded.case_rejected,
      crh = excluded.crh,
      signed_retainers = excluded.signed_retainers,
      unsigned_retainers = excluded.unsigned_retainers,
      converted_cases = excluded.converted_cases,
      rfc_sent = excluded.rfc_sent,
      total_case_wanted = excluded.total_case_wanted,
      signed_success_rate = excluded.signed_success_rate,
      week_label = excluded.week_label,
      present = excluded.present,
      ura = excluded.ura,
      reprocess = excluded.reprocess
  `)

  const insertMany = db.transaction((rows: any[]) => {
    let count = 0
    for (const row of rows) {
      // Query agent LOB from the database dynamically
      const agentInfo = db.prepare('SELECT lob FROM agents WHERE name = ?').get(row.agent_name) as { lob?: string } | undefined
      const isSSD = agentInfo?.lob === 'SSD'

      let total = 0
      let rate = 0

      if (isSSD) {
        // SSD: Conversion rate = Converted to Case / Signed Retainers
        total = row.signed_retainers || 0
        rate = total > 0 ? (row.converted_cases || 0) / total : 0
      } else {
        // VA: Sync live retainers from va_lead_records if present, or preserve existing
        const leads = db.prepare(`
          SELECT status FROM va_lead_records 
          WHERE date = ? AND (LOWER(rep_name) = LOWER(?) OR rep_username = ?)
        `).all(date, row.agent_name, row.agent_name) as { status: string }[]

        if (leads.length > 0) {
          row.signed_retainers = leads.filter((l) => l.status === 'Signed E-Sign').length
          row.unsigned_retainers = leads.filter((l) => l.status === 'Sent E-Sign' || l.status === 'Sign Follow Up').length
          row.crh = leads.filter((l) => l.status === 'Client Refused Help').length
          row.case_rejected = leads.filter((l) => l.status === 'Case Rejected').length
        } else {
          const existing = db.prepare('SELECT * FROM daily_performance WHERE date = ? AND agent_name = ?').get(date, row.agent_name) as any
          if (existing) {
            if (row.signed_retainers === undefined || row.signed_retainers === 0) row.signed_retainers = existing.signed_retainers
            if (row.unsigned_retainers === undefined || row.unsigned_retainers === 0) row.unsigned_retainers = existing.unsigned_retainers
            if (row.crh === undefined || row.crh === 0) row.crh = existing.crh
            if (row.case_rejected === undefined || row.case_rejected === 0) row.case_rejected = existing.case_rejected
          }
        }
        total = (row.signed_retainers || 0) + (row.unsigned_retainers || 0)
        rate = total > 0 ? (row.signed_retainers || 0) / total : 0
      }

      insert.run({
        date,
        agent_name: row.agent_name,
        capd: row.capd || 0,
        inbound_calls: row.inbound_calls || 0,
        case_rejected: row.case_rejected || 0,
        crh: row.crh || 0,
        signed_retainers: row.signed_retainers || 0,
        unsigned_retainers: row.unsigned_retainers || 0,
        converted_cases: row.converted_cases || 0,
        rfc_sent: row.rfc_sent || 0,
        total_case_wanted: total,
        signed_success_rate: rate,
        week_label: row.week_label || '',
        present: row.present || 'SI',
        ura: row.ura || 0,
        reprocess: row.reprocess || 0,
      })
      count++
    }
    return count
  })

  try {
    const count = insertMany(entries)
    console.log(`[performance POST] Saved ${count} rows for date=${date}`)

    // Force a WAL checkpoint so all committed pages are flushed to the main DB file.
    // Without this, data written in WAL mode may not survive a process restart before
    // SQLite's automatic checkpoint threshold is reached.
    db.pragma('wal_checkpoint(FULL)')

    return NextResponse.json({ success: true, count })
  } catch (err: any) {
    console.error('[performance POST] Transaction failed:', err.message)
    return NextResponse.json({ error: 'Failed to save data', detail: err.message }, { status: 500 })
  }
}
