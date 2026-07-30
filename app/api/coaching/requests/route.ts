import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'
import { sendCoachingWebhookNotification } from '@/lib/webhook'

// GET /api/coaching/requests
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = getDb()
    const isMaster = (session.user as any)?.role === 'master'
    const userName = session.user?.name || ''

    let query = `
      SELECT r.*, q.eval_date as linked_eval_date, q.overall_score as linked_eval_score, q.call_id as linked_eval_call_id
      FROM coaching_requests r
      INNER JOIN agents a ON r.agent_name = a.name
      LEFT JOIN qa_evaluations q ON r.linked_evaluation_id = q.id
      WHERE a.active = 1
    `
    const params: any[] = []

    if (!isMaster) {
      query += ' AND r.agent_name = ?'
      params.push(userName)
    }

    query += ' ORDER BY r.requested_at DESC'
    const rows = db.prepare(query).all(...params)

    // Fail-safe filtering for allowed agents (must exist as active regular user)
    const users = db.prepare("SELECT display_name FROM users WHERE role = 'regular' AND active = 1").all() as { display_name: string }[]
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

// POST /api/coaching/requests — Submit a request for feedback
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { linked_evaluation_id, preferred_date, agent_notes } = body
    const agentName = session.user?.name || ''

    if (!agent_notes || !agent_notes.trim()) {
      return NextResponse.json({ error: 'Missing feedback notes' }, { status: 400 })
    }

    const db = getDb()

    // Validate that the agent is a registered regular user
    const users = db.prepare("SELECT display_name FROM users WHERE role = 'regular'").all() as { display_name: string }[]
    const allowedAgents = users.map(u => u.display_name).filter(Boolean)
    const agentNameNormalized = agentName.trim().replace(/\s+/g, '').toLowerCase()
    const isAllowed = allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === agentNameNormalized)
    if (!isAllowed) {
      return NextResponse.json({ error: 'User is not authorized to request feedback.' }, { status: 400 })
    }

    const stmt = db.prepare(`
      INSERT INTO coaching_requests (agent_name, linked_evaluation_id, preferred_date, agent_notes, status)
      VALUES (?, ?, ?, ?, 'Pending')
    `)
    const result = stmt.run(
      agentName,
      linked_evaluation_id || null,
      preferred_date || null,
      agent_notes.trim()
    )

    // Notify all Master coaches in real-time via SSE
    const masters = db.prepare("SELECT username FROM users WHERE role = 'master' AND active = 1").all() as { username: string }[]
    for (const master of masters) {
      sendNotification({
        username: master.username,
        title: '🎯 Feedback Request Submitted',
        message: `${agentName} has requested a Coaching Feedback Session.${preferred_date ? ' Preferred: ' + preferred_date : ''}`,
        link: '/coaching'
      })
    }

    // Power Automate M365 Webhook notification
    sendCoachingWebhookNotification({
      agentName,
      preferredDate: preferred_date || undefined,
      agentNotes: agent_notes.trim(),
    }).catch((err) => console.error('[coaching] Failed to trigger webhook:', err))

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/coaching/requests — Update request status (e.g. decline or update notes)
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { id, status, coach_notes } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    if (!['Pending', 'Scheduled', 'Declined', 'Completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const db = getDb()
    const isMaster = (session.user as any)?.role === 'master'

    // Fetch the request
    const request = db.prepare('SELECT agent_name FROM coaching_requests WHERE id = ?').get(id) as { agent_name: string } | undefined
    if (!request) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    // Only master admins can update request statuses
    if (!isMaster) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    db.prepare(`
      UPDATE coaching_requests
      SET status = ?, coach_notes = ?
      WHERE id = ?
    `).run(status, coach_notes || null, id)

    // Notify the agent in real-time
    const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(request.agent_name) as { username: string } | undefined
    const recipientUsername = user?.username || request.agent_name.toLowerCase().replace(/\s+/g, '')

    sendNotification({
      username: recipientUsername,
      title: '📅 Feedback Request Updated',
      message: `Your Feedback Session request status has been updated to: ${status}.${coach_notes ? ' Notes: ' + coach_notes : ''}`,
      link: '/coaching'
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
