import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// Helper: Normalize Rep Name & Username (case-insensitive & Title Case)
export function normalizeRepInfo(rawName: string): { rep_name: string; rep_username: string } {
  if (!rawName) return { rep_name: 'Apps Rep', rep_username: 'apps_rep' }
  const trimmed = rawName.trim()
  const lower = trimmed.toLowerCase()

  if (lower.includes('estefani')) {
    return { rep_name: 'Estefani Cubides', rep_username: 'ecubides' }
  }
  if (lower.includes('samantha')) {
    return { rep_name: 'Samantha Benavides', rep_username: 'sbenavides' }
  }

  const titleCased = trimmed.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  const username = titleCased.toLowerCase().replace(/[^a-z0-9]/g, '')
  return { rep_name: titleCased, rep_username: username }
}

// GET /api/apps-team — Fetch entries & summary analytics
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const rep = searchParams.get('rep')
  const converted = searchParams.get('converted')
  const search = searchParams.get('search')

  const db = getDb()
  const userRole = (session.user as any)?.role || 'regular'
  const sessionUsername = session.user?.email || ''
  const sessionLob = (session.user as any)?.lob || 'VA'

  let query = 'SELECT * FROM apps_team_entries WHERE 1=1'
  const params: any[] = []

  // Regular user restriction if assigned to APPS lob
  if (userRole === 'regular' && sessionLob === 'APPS') {
    query += ' AND (rep_username = ? OR rep_name LIKE ?)'
    params.push(sessionUsername, `%${session.user?.name || ''}%`)
  } else if (rep && rep !== 'All') {
    query += ' AND (rep_name = ? OR rep_username = ?)'
    params.push(rep, rep)
  }

  if (from) {
    query += ' AND date_completed >= ?'
    params.push(from)
  }
  if (to) {
    query += ' AND date_completed <= ?'
    params.push(to)
  }
  if (converted && converted !== 'All') {
    query += ' AND converted = ?'
    params.push(converted.toUpperCase())
  }
  if (search) {
    query += ' AND (lead_id LIKE ? OR client_name LIKE ? OR reason_not_converted LIKE ? OR other_reason LIKE ?)'
    const s = `%${search}%`
    params.push(s, s, s, s)
  }

  query += ' ORDER BY date_completed DESC, id DESC'

  try {
    const entries = db.prepare(query).all(...params)

    // Compute Summary Stats
    const total = entries.length
    const convertedCount = entries.filter((e: any) => e.converted === 'YES').length
    const pendingCount = entries.filter((e: any) => e.converted === 'NO').length
    const conversionRate = total > 0 ? Math.round((convertedCount / total) * 1000) / 10 : 0

    // Non-conversion reasons breakdown
    const reasonsBreakdown: Record<string, number> = {
      'Need Reps': 0,
      'Need Wet 827': 0,
      'Yellow Screen (CC with SSA scheduled)': 0,
      'Rejected (While on Application)': 0,
      'Other': 0,
    }

    entries.forEach((e: any) => {
      if (e.converted === 'NO') {
        const cat = e.reason_not_converted || 'Other'
        if (reasonsBreakdown[cat] !== undefined) {
          reasonsBreakdown[cat]++
        } else {
          reasonsBreakdown['Other']++
        }
      }
    })

    return NextResponse.json({
      entries,
      summary: {
        total,
        converted: convertedCount,
        pending: pendingCount,
        conversion_rate: conversionRate,
        reasons_breakdown: reasonsBreakdown,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/apps-team — Create new application entry
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { lead_id, client_name, date_completed, converted, reason_not_converted, other_reason, rep_name } = body

    if (!lead_id || !client_name || !date_completed) {
      return NextResponse.json({ error: 'Lead ID, Client Name, and Date Completed are required.' }, { status: 400 })
    }

    const sessionUsername = session.user?.email || ''
    const rawRepName = rep_name || session.user?.name || sessionUsername
    const { rep_name: finalRepName, rep_username: repUsername } = normalizeRepInfo(rawRepName)

    const db = getDb()

    // Ensure uniqueness check for Lead ID
    const existing = db.prepare('SELECT id FROM apps_team_entries WHERE lead_id = ?').get(lead_id)
    if (existing) {
      return NextResponse.json({ error: `An entry for Lead ID "${lead_id}" already exists.` }, { status: 400 })
    }

    const isConverted = (converted || 'NO').toUpperCase() === 'YES' ? 'YES' : 'NO'
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ')

    const stmt = db.prepare(`
      INSERT INTO apps_team_entries (
        lead_id, client_name, date_completed, converted, 
        reason_not_converted, other_reason, rep_username, rep_name, converted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      String(lead_id).trim(),
      String(client_name).trim(),
      date_completed,
      isConverted,
      isConverted === 'NO' ? (reason_not_converted || 'Other') : null,
      isConverted === 'NO' ? (other_reason || '') : null,
      repUsername,
      finalRepName,
      isConverted === 'YES' ? nowStr : null
    )

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/apps-team — Update application entry or toggle conversion status
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, lead_id, client_name, date_completed, converted, reason_not_converted, other_reason } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing entry ID.' }, { status: 400 })
    }

    const db = getDb()
    const entry = db.prepare('SELECT * FROM apps_team_entries WHERE id = ?').get(id) as any
    if (!entry) {
      return NextResponse.json({ error: 'Application entry not found.' }, { status: 404 })
    }

    const isConverted = (converted || entry.converted).toUpperCase() === 'YES' ? 'YES' : 'NO'
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const convertedAt = isConverted === 'YES' ? (entry.converted_at || nowStr) : null

    db.prepare(`
      UPDATE apps_team_entries
      SET lead_id = ?,
          client_name = ?,
          date_completed = ?,
          converted = ?,
          reason_not_converted = ?,
          other_reason = ?,
          converted_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      lead_id || entry.lead_id,
      client_name || entry.client_name,
      date_completed || entry.date_completed,
      isConverted,
      isConverted === 'NO' ? (reason_not_converted || entry.reason_not_converted || 'Other') : null,
      isConverted === 'NO' ? (other_reason !== undefined ? other_reason : entry.other_reason) : null,
      convertedAt,
      id
    )

    return NextResponse.json({ success: true, converted: isConverted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/apps-team?id=X — Delete application entry
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing entry ID.' }, { status: 400 })
  }

  try {
    const db = getDb()
    db.prepare('DELETE FROM apps_team_entries WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
