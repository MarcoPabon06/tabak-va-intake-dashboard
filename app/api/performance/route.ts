import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/performance?from=YYYY-MM-DD&to=YYYY-MM-DD&agent=name
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') || '2020-01-01'
  const to = searchParams.get('to') || '2099-12-31'
  const agent = searchParams.get('agent') || null

  const db = getDb()

  let query = `SELECT * FROM daily_performance WHERE date >= ? AND date <= ?`
  const params: any[] = [from, to]

  if (agent) {
    query += ` AND agent_name = ?`
    params.push(agent)
  }

  query += ` ORDER BY date ASC, agent_name ASC`

  const rows = db.prepare(query).all(...params)
  return NextResponse.json(rows)
}

// POST /api/performance  — daily entry (master only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
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
      signed_retainers, unsigned_retainers, total_case_wanted,
      signed_success_rate, week_label, present, ura, reprocess
    ) VALUES (
      @date, @agent_name, @capd, @inbound_calls, @case_rejected, @crh,
      @signed_retainers, @unsigned_retainers, @total_case_wanted,
      @signed_success_rate, @week_label, @present, @ura, @reprocess
    )
    ON CONFLICT(date, agent_name) DO UPDATE SET
      capd = excluded.capd,
      inbound_calls = excluded.inbound_calls,
      case_rejected = excluded.case_rejected,
      crh = excluded.crh,
      signed_retainers = excluded.signed_retainers,
      unsigned_retainers = excluded.unsigned_retainers,
      total_case_wanted = excluded.total_case_wanted,
      signed_success_rate = excluded.signed_success_rate,
      week_label = excluded.week_label,
      present = excluded.present,
      ura = excluded.ura,
      reprocess = excluded.reprocess
  `)

  const insertMany = db.transaction((rows: any[]) => {
    for (const row of rows) {
      const total = (row.signed_retainers || 0) + (row.unsigned_retainers || 0)
      const rate = total > 0 ? (row.signed_retainers || 0) / total : 0
      insert.run({
        date,
        agent_name: row.agent_name,
        capd: row.capd || 0,
        inbound_calls: row.inbound_calls || 0,
        case_rejected: row.case_rejected || 0,
        crh: row.crh || 0,
        signed_retainers: row.signed_retainers || 0,
        unsigned_retainers: row.unsigned_retainers || 0,
        total_case_wanted: total,
        signed_success_rate: rate,
        week_label: row.week_label || '',
        present: row.present || 'SI',
        ura: row.ura || 0,
        reprocess: row.reprocess || 0,
      })
    }
  })

  insertMany(entries)
  return NextResponse.json({ success: true, count: entries.length })
}
