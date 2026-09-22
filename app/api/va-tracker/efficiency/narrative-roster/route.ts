import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { isAuthorizedVaTeamLead } from '../../route'
import { evaluateCompliance } from '../route'
import { getBusinessDate } from '@/lib/dateUtils'

// Helper to get the Monday of the week for a given YYYY-MM-DD
function getMonday(dStr?: string | null): string {
  const base = dStr && dStr.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(dStr + 'T12:00:00') : new Date()
  const day = base.getDay()
  const diff = base.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
  const monday = new Date(base.setDate(diff))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
}

// GET /api/va-tracker/efficiency/narrative-roster?week=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedVaTeamLead(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const week = getMonday(searchParams.get('week'))
    const db = getDb()

    // 1. Get all active VA intake reps
    const activeReps = db.prepare(`SELECT display_name, username FROM users WHERE active = 1 AND lob = 'VA' AND role = 'regular' ORDER BY display_name ASC`).all() as any[]
    
    // Also include reps from agents table if not in users
    const agentRows = db.prepare(`SELECT name FROM agents WHERE active = 1 AND lob = 'VA' ORDER BY name ASC`).all() as any[]
    const combinedRepsMap = new Map<string, string>()
    activeReps.forEach(r => {
      const repName = r.display_name || r.username
      if (repName) combinedRepsMap.set(repName, r.username)
    })
    agentRows.forEach(a => {
      if (a.name && !combinedRepsMap.has(a.name)) {
        combinedRepsMap.set(a.name, a.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
      }
    })

    const allVaReps = Array.from(combinedRepsMap.entries()).map(([name, username]) => ({ name, username }))

    // 2. Get assigned narrative reps for this week
    const assignedRows = db.prepare(`SELECT agent_name FROM va_dialer_narrative_assignments WHERE week_start_date = ?`).all(week) as any[]
    const assignedNames = assignedRows.map(r => r.agent_name)

    return NextResponse.json({
      weekStartDate: week,
      assignedNames,
      allVaReps,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/va-tracker/efficiency/narrative-roster — Save weekly narrative assignments
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !isAuthorizedVaTeamLead(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { week_start_date, agent_names = [] } = body
    const week = getMonday(week_start_date)
    const db = getDb()
    const assignedBy = session.user?.name || 'Administrator'

    // Delete existing assignments for this week
    db.prepare(`DELETE FROM va_dialer_narrative_assignments WHERE week_start_date = ?`).run(week)

    // Insert new assignments
    const insertStmt = db.prepare(`
      INSERT INTO va_dialer_narrative_assignments (week_start_date, agent_name, assigned_by, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `)

    for (const name of agent_names) {
      if (name && typeof name === 'string' && name.trim()) {
        insertStmt.run(week, name.trim(), assignedBy)
      }
    }

    // Automatically synchronize any existing efficiency records for this week (Monday through Sunday)
    // Compute Sunday end date
    const [y, m, d] = week.split('-').map(Number)
    const monDate = new Date(y, m - 1, d)
    const sunDate = new Date(monDate)
    sunDate.setDate(monDate.getDate() + 6)
    const pad = (n: number) => String(n).padStart(2, '0')
    const weekEnd = `${sunDate.getFullYear()}-${pad(sunDate.getMonth() + 1)}-${pad(sunDate.getDate())}`

    const weekRecords = db.prepare(`
      SELECT * FROM va_dialer_efficiency_records
      WHERE date >= ? AND date <= ?
    `).all(week, weekEnd) as any[]

    const cleanAssignedSet = new Set(agent_names.map((n: string) => n.toLowerCase().trim()))

    for (const rec of weekRecords) {
      const isNarrative = cleanAssignedSet.has(rec.agent_name.toLowerCase().trim()) ? 1 : 0
      const { busyStatus } = evaluateCompliance({
        ...rec,
        is_narrative_rep: isNarrative,
      })

      db.prepare(`
        UPDATE va_dialer_efficiency_records
        SET is_narrative_rep = ?,
            busy_status = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(isNarrative, busyStatus, rec.id)
    }

    return NextResponse.json({
      success: true,
      weekStartDate: week,
      assignedCount: agent_names.length,
      updatedRecordsCount: weekRecords.length,
      message: `Weekly Narrative Roster saved for ${week}. ${agent_names.length} specialists assigned (2.5h daily busy allowance applied).`,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
