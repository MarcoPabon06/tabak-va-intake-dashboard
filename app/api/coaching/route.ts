import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'

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
    const isMaster = (session.user as any)?.role === 'master'
    const userName = session.user?.name || ''

    let query = `
      SELECT c.*, q.eval_date as linked_eval_date, q.overall_score as linked_eval_score, q.call_id as linked_eval_call_id
      FROM coaching_sessions c
      INNER JOIN agents a ON c.agent_name = a.name
      LEFT JOIN qa_evaluations q ON c.linked_evaluation_id = q.id
      WHERE a.active = 1
    `
    const params: any[] = []

    if (!isMaster) {
      // Regular user can only view their own coaching sessions
      query += ' AND c.agent_name = ?'
      params.push(userName)
    } else if (agent) {
      // Admin can filter by agent
      query += ' AND c.agent_name = ?'
      params.push(agent)
    }

    query += ' ORDER BY c.session_date DESC'
    const rows = db.prepare(query).all(...params)
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/coaching — Log a new coaching session
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user as any)?.role !== 'master') {
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
    } = body

    if (!agent_name || !session_date || !focus_areas) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = getDb()
    const focusString = Array.isArray(focus_areas) ? focus_areas.join(', ') : focus_areas

    const stmt = db.prepare(`
      INSERT INTO coaching_sessions (
        agent_name, coach_name, session_date, focus_areas,
        linked_evaluation_id, discussion_notes, commitments_agent,
        commitments_coach, follow_up_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      agent_name,
      session.user?.name || 'QA Admin',
      session_date,
      focusString,
      linked_evaluation_id || null,
      discussion_notes || null,
      commitments_agent || null,
      commitments_coach || null,
      follow_up_date || null
    )

    // Notify the agent in real-time
    const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(agent_name) as { username: string } | undefined
    const recipientUsername = user?.username || agent_name.toLowerCase().replace(/\s+/g, '')

    sendNotification({
      username: recipientUsername,
      title: '🎯 New Coaching Session Logged',
      message: `A new coaching session has been logged by ${session.user?.name || 'Coach'} focusing on ${focusString}.${follow_up_date ? ' Follow-up: ' + follow_up_date : ''}`,
      link: '/coaching'
    })

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
