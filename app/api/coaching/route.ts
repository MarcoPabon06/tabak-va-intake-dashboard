import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'
import { sendCoachingStatusWebhookNotification } from '@/lib/webhook'

// GET /api/coaching?agent=Name
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const agent = searchParams.get('agent')

    const db = getDb()
    const userRole = (session.user as any)?.role || 'regular'
    const userPerms = (session.user as any)?.permissions
    const isMaster = userRole === 'master' || userRole === 'superadmin' || (userRole === 'admin' && Boolean(userPerms?.canManageCoaching || userPerms?.canViewQA || userPerms?.canPerformQA))
    const userName = session.user?.name || ''

    let query = `
      SELECT c.*, q.eval_date as linked_eval_date, q.overall_score as linked_eval_score, q.call_id as linked_eval_call_id
      FROM coaching_sessions c
      INNER JOIN agents a ON c.agent_name = a.name
      LEFT JOIN qa_evaluations q ON c.linked_evaluation_id = q.id
      WHERE a.active = 1
    `
    const params: any[] = []

    const allowedLobs: string[] = userRole === 'admin'
      ? (Array.isArray(userPerms?.allowedLobs) ? userPerms.allowedLobs : ['VA', 'SSD'])
      : ['VA', 'SSD', 'APPS']

    if (!isMaster) {
      // Regular user can only view their own coaching sessions
      query += ' AND c.agent_name = ?'
      params.push(userName)
    } else {
      if (userRole === 'admin' && !allowedLobs.includes('All')) {
        const placeholders = allowedLobs.map(() => '?').join(',')
        query += ` AND a.lob IN (${placeholders})`
        params.push(...allowedLobs)
      }
      if (agent) {
        // Admin can filter by agent
        query += ' AND c.agent_name = ?'
        params.push(agent)
      }
    }

    query += ' ORDER BY c.session_date DESC'
    const rows = db.prepare(query).all(...params)

    // Fail-safe filtering for allowed agents (must exist as regular user in users table)
    let users = db.prepare("SELECT display_name, lob FROM users WHERE role IN ('regular', 'admin')").all() as { display_name: string; lob?: string }[]
    if (userRole === 'admin' && !allowedLobs.includes('All')) {
      users = users.filter(u => allowedLobs.includes(u.lob || 'VA'))
    }
    const allowedAgents = users.map(u => u.display_name).filter(Boolean)
    const filteredRows = rows.filter((r: any) => {
      const normalized = r.agent_name.trim().replace(/\s+/g, '').toLowerCase()
      return allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === normalized)
    })

    return NextResponse.json(filteredRows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/coaching — Log a new coaching session
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role
    const perms = (session?.user as any)?.permissions
    if (!session || (role !== 'master' && role !== 'superadmin' && !perms?.canManageCoaching)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      agent_name,
      session_date,
      focus_areas,
      linked_evaluation_id,
      discussion_notes,
      commitments_agent,
      commitments_coach,
      follow_up_date,
      coaching_request_id,
    } = body

    if (!agent_name || !session_date || !focus_areas) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Restrict to allowed VA Intake Reps only (must exist as regular user in users table)
    const db = getDb()
    const users = db.prepare("SELECT display_name FROM users WHERE role = 'regular'").all() as { display_name: string }[]
    const allowedAgents = users.map(u => u.display_name).filter(Boolean)
    const agentNameNormalized = agent_name.trim().replace(/\s+/g, '').toLowerCase()
    const isAllowed = allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === agentNameNormalized)
    if (!isAllowed) {
      return NextResponse.json({ error: `Agent "${agent_name}" is not a registered user.` }, { status: 400 })
    }
    const focusString = Array.isArray(focus_areas) ? focus_areas.join(', ') : focus_areas

    const stmt = db.prepare(`
      INSERT INTO coaching_sessions (
        agent_name, coach_name, session_date, focus_areas,
        linked_evaluation_id, discussion_notes, commitments_agent,
        commitments_coach, follow_up_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const coachName = session.user?.name || 'QA Coach'

    const result = stmt.run(
      agent_name,
      coachName,
      session_date,
      focusString,
      linked_evaluation_id || null,
      discussion_notes || null,
      commitments_agent || null,
      commitments_coach || null,
      follow_up_date || null
    )

    const coachingSessionId = result.lastInsertRowid

    // If there is an associated coaching_request_id, update its status
    if (coaching_request_id) {
      const today = new Date().toISOString().slice(0, 10)
      const isPast = session_date <= today
      const requestStatus = isPast ? 'Completed' : 'Scheduled'

      db.prepare(`
        UPDATE coaching_requests
        SET status = ?, scheduled_coaching_id = ?
        WHERE id = ?
      `).run(requestStatus, coachingSessionId, coaching_request_id)
    }

    // Notify the agent in real-time
    const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(agent_name) as { username: string } | undefined
    const recipientUsername = user?.username || agent_name.toLowerCase().replace(/\s+/g, '')

    sendNotification({
      username: recipientUsername,
      title: '🎯 New Coaching Session Logged',
      message: `A new coaching session has been logged by ${coachName} focusing on ${focusString}.${follow_up_date ? ' Follow-up: ' + follow_up_date : ''}`,
      link: '/coaching'
    })

    // Email specialist via Power Automate Webhook
    sendCoachingStatusWebhookNotification({
      agentName: agent_name,
      coachName,
      sessionDate: session_date,
      status: 'Scheduled',
      focusAreas: focusString,
      coachNotes: discussion_notes || undefined,
    }).catch((err) => console.error('[coaching] Failed to trigger webhook for specialist:', err))

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/coaching?id=123
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user as any)?.role !== 'master') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const db = getDb()
    db.prepare('DELETE FROM coaching_sessions WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
