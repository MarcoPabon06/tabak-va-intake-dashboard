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

  // Single Batch SQL Aggregations for VA and SSD to attribute signed retainers & conversions by their actual effective dates
  const vaMap = new Map<string, { signed: number; unsigned: number; crh: number; rejected: number; rep_name: string }>()

  // 1. VA Logged activity on entered date (unsigned retainers, CRH, rejected)
  const vaLoggedRows = db.prepare(`
    SELECT 
      date,
      rep_name,
      LOWER(TRIM(rep_name)) as rep_name_clean,
      LOWER(TRIM(rep_username)) as rep_username_clean,
      SUM(CASE WHEN status IN ('Sent E-Sign', 'Sign Follow Up') THEN 1 ELSE 0 END) as unsigned,
      SUM(CASE WHEN status = 'Client Refused Help' THEN 1 ELSE 0 END) as crh,
      SUM(CASE WHEN status = 'Case Rejected' THEN 1 ELSE 0 END) as rejected
    FROM va_lead_records
    WHERE date >= ? AND date <= ?
    GROUP BY date, rep_name_clean, rep_username_clean
  `).all(from, to) as any[]

  for (const r of vaLoggedRows) {
    const keyName = `${r.date}___${r.rep_name_clean}`
    const keyUser = `${r.date}___${r.rep_username_clean}`
    
    let item = vaMap.get(keyName)
    if (!item) {
      item = { signed: 0, unsigned: 0, crh: 0, rejected: 0, rep_name: r.rep_name }
      vaMap.set(keyName, item)
    }
    item.unsigned += r.unsigned || 0
    item.crh += r.crh || 0
    item.rejected += r.rejected || 0

    if (r.rep_username_clean && keyUser !== keyName) {
      vaMap.set(keyUser, item)
    }
  }

  // 2. VA Signed retainers attributed to ACTUAL signed date (signed_at)
  const vaSignedRows = db.prepare(`
    SELECT 
      COALESCE(NULLIF(SUBSTR(signed_at, 1, 10), ''), date) as signed_date,
      rep_name,
      LOWER(TRIM(rep_name)) as rep_name_clean,
      LOWER(TRIM(rep_username)) as rep_username_clean,
      COUNT(*) as signed
    FROM va_lead_records
    WHERE status = 'Signed E-Sign'
      AND COALESCE(NULLIF(SUBSTR(signed_at, 1, 10), ''), date) >= ?
      AND COALESCE(NULLIF(SUBSTR(signed_at, 1, 10), ''), date) <= ?
    GROUP BY signed_date, rep_name_clean, rep_username_clean
  `).all(from, to) as any[]

  for (const r of vaSignedRows) {
    const keyName = `${r.signed_date}___${r.rep_name_clean}`
    const keyUser = `${r.signed_date}___${r.rep_username_clean}`

    let item = vaMap.get(keyName)
    if (!item) {
      item = { signed: 0, unsigned: 0, crh: 0, rejected: 0, rep_name: r.rep_name }
      vaMap.set(keyName, item)
    }
    item.signed += r.signed || 0

    if (r.rep_username_clean && keyUser !== keyName) {
      vaMap.set(keyUser, item)
    }
  }

  // SSD Map
  const ssdMap = new Map<string, { signed: number; unsigned: number; rfc: number; crh: number; rejected: number; converted: number; rep_name: string }>()

  // 1. SSD Logged activity on entered date (unsigned, RFC, CRH, rejected)
  const ssdLoggedRows = db.prepare(`
    SELECT 
      date,
      rep_name,
      LOWER(TRIM(rep_name)) as rep_name_clean,
      LOWER(TRIM(rep_username)) as rep_username_clean,
      SUM(CASE WHEN status IN ('Sent E-Sign', 'Paper Retainer Sent') THEN 1 ELSE 0 END) as unsigned,
      SUM(CASE WHEN status = 'Sent RFC' THEN 1 ELSE 0 END) as rfc,
      SUM(CASE WHEN status = 'Client Refused Help' THEN 1 ELSE 0 END) as crh,
      SUM(CASE WHEN status = 'Case Rejected' THEN 1 ELSE 0 END) as rejected
    FROM ssd_lead_records
    WHERE date >= ? AND date <= ?
    GROUP BY date, rep_name_clean, rep_username_clean
  `).all(from, to) as any[]

  for (const r of ssdLoggedRows) {
    const keyName = `${r.date}___${r.rep_name_clean}`
    const keyUser = `${r.date}___${r.rep_username_clean}`

    let item = ssdMap.get(keyName)
    if (!item) {
      item = { signed: 0, unsigned: 0, rfc: 0, crh: 0, rejected: 0, converted: 0, rep_name: r.rep_name }
      ssdMap.set(keyName, item)
    }
    item.unsigned += r.unsigned || 0
    item.rfc += r.rfc || 0
    item.crh += r.crh || 0
    item.rejected += r.rejected || 0

    if (r.rep_username_clean && keyUser !== keyName) {
      ssdMap.set(keyUser, item)
    }
  }

  // 2. SSD Signed retainers attributed to ACTUAL signed date (signed_at)
  const ssdSignedRows = db.prepare(`
    SELECT 
      COALESCE(NULLIF(SUBSTR(signed_at, 1, 10), ''), date) as signed_date,
      rep_name,
      LOWER(TRIM(rep_name)) as rep_name_clean,
      LOWER(TRIM(rep_username)) as rep_username_clean,
      COUNT(*) as signed
    FROM ssd_lead_records
    WHERE status = 'Signed E-Sign'
      AND COALESCE(NULLIF(SUBSTR(signed_at, 1, 10), ''), date) >= ?
      AND COALESCE(NULLIF(SUBSTR(signed_at, 1, 10), ''), date) <= ?
    GROUP BY signed_date, rep_name_clean, rep_username_clean
  `).all(from, to) as any[]

  for (const r of ssdSignedRows) {
    const keyName = `${r.signed_date}___${r.rep_name_clean}`
    const keyUser = `${r.signed_date}___${r.rep_username_clean}`

    let item = ssdMap.get(keyName)
    if (!item) {
      item = { signed: 0, unsigned: 0, rfc: 0, crh: 0, rejected: 0, converted: 0, rep_name: r.rep_name }
      ssdMap.set(keyName, item)
    }
    item.signed += r.signed || 0

    if (r.rep_username_clean && keyUser !== keyName) {
      ssdMap.set(keyUser, item)
    }
  }

  // 3. SSD Converted Cases attributed to ACTUAL converted date (converted_at)
  const ssdConvertedRows = db.prepare(`
    SELECT 
      COALESCE(NULLIF(SUBSTR(converted_at, 1, 10), ''), NULLIF(SUBSTR(signed_at, 1, 10), ''), date) as conv_date,
      rep_name,
      LOWER(TRIM(rep_name)) as rep_name_clean,
      LOWER(TRIM(rep_username)) as rep_username_clean,
      COUNT(*) as converted
    FROM ssd_lead_records
    WHERE is_converted = 1
      AND COALESCE(NULLIF(SUBSTR(converted_at, 1, 10), ''), NULLIF(SUBSTR(signed_at, 1, 10), ''), date) >= ?
      AND COALESCE(NULLIF(SUBSTR(converted_at, 1, 10), ''), NULLIF(SUBSTR(signed_at, 1, 10), ''), date) <= ?
    GROUP BY conv_date, rep_name_clean, rep_username_clean
  `).all(from, to) as any[]

  for (const r of ssdConvertedRows) {
    const keyName = `${r.conv_date}___${r.rep_name_clean}`
    const keyUser = `${r.conv_date}___${r.rep_username_clean}`

    let item = ssdMap.get(keyName)
    if (!item) {
      item = { signed: 0, unsigned: 0, rfc: 0, crh: 0, rejected: 0, converted: 0, rep_name: r.rep_name }
      ssdMap.set(keyName, item)
    }
    item.converted += r.converted || 0

    if (r.rep_username_clean && keyUser !== keyName) {
      ssdMap.set(keyUser, item)
    }
  }

  // Dynamically enhance VA and SSD specialist performance with batch tracker records
  const enhancedRows = rows.map((row) => {
    const key = `${row.date}___${row.agent_name.toLowerCase().trim()}`
    if (row.lob === 'VA') {
      const vaData = vaMap.get(key)
      if (vaData) {
        const total = (vaData.signed || 0) + (vaData.unsigned || 0)
        return {
          ...row,
          signed_retainers: vaData.signed || 0,
          unsigned_retainers: vaData.unsigned || 0,
          crh: vaData.crh || 0,
          case_rejected: vaData.rejected || 0,
          total_case_wanted: total,
          signed_success_rate: total > 0 ? (vaData.signed || 0) / total : 0,
        }
      }
    } else if (row.lob === 'SSD') {
      const ssdData = ssdMap.get(key)
      if (ssdData) {
        const total = (ssdData.signed || 0) + (ssdData.unsigned || 0)
        const maxConverted = Math.max(row.converted_cases || 0, ssdData.converted || 0)
        return {
          ...row,
          signed_retainers: ssdData.signed || 0,
          unsigned_retainers: ssdData.unsigned || 0,
          rfc_sent: ssdData.rfc || 0,
          crh: ssdData.crh || 0,
          case_rejected: ssdData.rejected || 0,
          converted_cases: maxConverted,
          total_case_wanted: total,
          signed_success_rate: total > 0 ? (ssdData.signed || 0) / total : 0,
        }
      }
    }
    return row
  })

  // Check for any VA or SSD leads logged on dates without a daily_performance row yet
  const existingKeys = new Set(enhancedRows.map((r) => `${r.date}___${r.agent_name.toLowerCase()}`))

  // Active users map for canonical display names and LOB filtering
  const userRows = db.prepare(`
    SELECT display_name, username, lob 
    FROM users 
    WHERE role = 'regular' AND active = 1
  `).all() as { display_name: string; username: string; lob: string }[]

  const userMap = new Map<string, { display_name: string; username: string; lob: string }>()
  for (const u of userRows) {
    if (u.display_name) userMap.set(u.display_name.toLowerCase().trim(), u)
    if (u.username) userMap.set(u.username.toLowerCase().trim(), u)
  }

  // VA unmapped synthetic rows (derived from all active entries in vaMap)
  if ((!lob || lob === 'VA' || lob === 'All') && (userRole !== 'regular' || userLob === 'VA')) {
    const processedVaKeys = new Set<string>()

    for (const [key, vaData] of vaMap.entries()) {
      const parts = key.split('___')
      if (parts.length < 2) continue
      const date = parts[0]
      const cleanName = parts[1]

      const dedupeKey = `${date}___${cleanName}`
      if (processedVaKeys.has(dedupeKey) || existingKeys.has(dedupeKey)) continue
      processedVaKeys.add(dedupeKey)

      const userInfo = userMap.get(cleanName)
      if (userInfo && userInfo.lob !== 'VA') continue // Not a VA specialist

      if (agent && agent.toLowerCase().trim() !== cleanName && agent.toLowerCase().trim() !== userInfo?.display_name.toLowerCase().trim() && agent.toLowerCase().trim() !== userInfo?.username.toLowerCase().trim()) {
        continue
      }

      const agentName = userInfo?.display_name || vaData.rep_name || cleanName
      const total = (vaData.signed || 0) + (vaData.unsigned || 0)

      enhancedRows.push({
        id: `synth-va-${date}-${agentName}`,
        date: date,
        agent_name: agentName,
        lob: 'VA',
        capd: 0,
        inbound_calls: 0,
        case_rejected: vaData.rejected || 0,
        crh: vaData.crh || 0,
        signed_retainers: vaData.signed || 0,
        unsigned_retainers: vaData.unsigned || 0,
        converted_cases: 0,
        rfc_sent: 0,
        total_case_wanted: total,
        signed_success_rate: total > 0 ? (vaData.signed || 0) / total : 0,
        week_label: '',
        present: 'SI',
        ura: 0,
        reprocess: 0,
      })
    }
  }

  // SSD unmapped synthetic rows (derived from all active entries in ssdMap)
  if ((!lob || lob === 'SSD' || lob === 'All') && (userRole !== 'regular' || userLob === 'SSD')) {
    const processedSsdKeys = new Set<string>()

    for (const [key, ssdData] of ssdMap.entries()) {
      const parts = key.split('___')
      if (parts.length < 2) continue
      const date = parts[0]
      const cleanName = parts[1]

      const dedupeKey = `${date}___${cleanName}`
      if (processedSsdKeys.has(dedupeKey) || existingKeys.has(dedupeKey)) continue
      processedSsdKeys.add(dedupeKey)

      const userInfo = userMap.get(cleanName)
      if (userInfo && userInfo.lob !== 'SSD') continue // Not an SSD specialist

      if (agent && agent.toLowerCase().trim() !== cleanName && agent.toLowerCase().trim() !== userInfo?.display_name.toLowerCase().trim() && agent.toLowerCase().trim() !== userInfo?.username.toLowerCase().trim()) {
        continue
      }

      const agentName = userInfo?.display_name || ssdData.rep_name || cleanName
      const total = (ssdData.signed || 0) + (ssdData.unsigned || 0)

      enhancedRows.push({
        id: `synth-ssd-${date}-${agentName}`,
        date: date,
        agent_name: agentName,
        lob: 'SSD',
        capd: 0,
        inbound_calls: 0,
        case_rejected: ssdData.rejected || 0,
        crh: ssdData.crh || 0,
        signed_retainers: ssdData.signed || 0,
        unsigned_retainers: ssdData.unsigned || 0,
        converted_cases: ssdData.converted || 0,
        rfc_sent: ssdData.rfc || 0,
        total_case_wanted: total,
        signed_success_rate: total > 0 ? (ssdData.signed || 0) / total : 0,
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
        // SSD: Sync live retainers & converted from ssd_lead_records if present, or preserve existing
        const leads = db.prepare(`
          SELECT status, is_converted FROM ssd_lead_records 
          WHERE date = ? AND (LOWER(rep_name) = LOWER(?) OR rep_username = ?)
        `).all(date, row.agent_name, row.agent_name) as { status: string; is_converted: number }[]

        if (leads.length > 0) {
          row.signed_retainers = leads.filter((l) => l.status === 'Signed E-Sign').length
          row.unsigned_retainers = leads.filter((l) => l.status === 'Sent E-Sign' || l.status === 'Paper Retainer Sent').length
          row.rfc_sent = leads.filter((l) => l.status === 'Sent RFC').length
          row.crh = leads.filter((l) => l.status === 'Client Refused Help').length
          row.case_rejected = leads.filter((l) => l.status === 'Case Rejected').length
          const converted = leads.filter((l) => l.is_converted === 1).length
          row.converted_cases = Math.max(row.converted_cases || 0, converted)
        } else {
          const existing = db.prepare('SELECT * FROM daily_performance WHERE date = ? AND agent_name = ?').get(date, row.agent_name) as any
          if (existing) {
            if (row.signed_retainers === undefined || row.signed_retainers === 0) row.signed_retainers = existing.signed_retainers
            if (row.unsigned_retainers === undefined || row.unsigned_retainers === 0) row.unsigned_retainers = existing.unsigned_retainers
            if (row.rfc_sent === undefined || row.rfc_sent === 0) row.rfc_sent = existing.rfc_sent
            if (row.crh === undefined || row.crh === 0) row.crh = existing.crh
            if (row.case_rejected === undefined || row.case_rejected === 0) row.case_rejected = existing.case_rejected
            if (row.converted_cases === undefined || row.converted_cases === 0) row.converted_cases = existing.converted_cases
          }
        }
        total = (row.signed_retainers || 0) + (row.unsigned_retainers || 0)
        rate = (row.signed_retainers || 0) > 0 ? (row.converted_cases || 0) / row.signed_retainers : 0
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
