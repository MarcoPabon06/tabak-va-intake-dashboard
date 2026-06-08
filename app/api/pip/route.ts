import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'

// GET /api/pip?agent=Name
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
      SELECT p.*
      FROM pip_plans p
      INNER JOIN agents a ON p.agent_name = a.name
      WHERE a.active = 1
    `
    const params: any[] = []

    if (!isMaster) {
      // Regular users can only see their own PIP plans
      query += ' AND p.agent_name = ?'
      params.push(userName)
    } else if (agent) {
      // Admins can filter by agent
      query += ' AND p.agent_name = ?'
      params.push(agent)
    }

    query += ' ORDER BY p.start_date DESC'
    const rows = db.prepare(query).all(...params) as any[]

    // Fail-safe filtering for allowed agents (must exist in users table)
    const users = db.prepare('SELECT display_name FROM users').all() as { display_name: string }[]
    const allowedAgents = users.map(u => u.display_name).filter(Boolean)
    const filteredRows = rows.filter((r: any) => {
      const normalized = r.agent_name.trim().replace(/\s+/g, '').toLowerCase()
      return allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === normalized)
    })

    // Enrich each PIP plan with dynamically computed current average QA score and list of evaluations in the PIP date range
    const enrichedRows = filteredRows.map((row) => {
      const currentAvg = db.prepare(`
        SELECT AVG(overall_score) as avg
        FROM qa_evaluations
        WHERE agent_name = ? 
          AND eval_date >= ? 
          AND eval_date <= ?
      `).get(row.agent_name, row.start_date, row.end_date) as { avg: number | null } | undefined

      const evaluationsDuringPip = db.prepare(`
        SELECT id, eval_date, overall_score, call_id, tier
        FROM qa_evaluations
        WHERE agent_name = ? 
          AND eval_date >= ? 
          AND eval_date <= ?
        ORDER BY eval_date DESC
      `).all(row.agent_name, row.start_date, row.end_date)

      const computedAvg = currentAvg?.avg != null ? Math.round(currentAvg.avg * 10) / 10 : null

      return {
        ...row,
        current_avg_score: computedAvg,
        evaluations: evaluationsDuringPip,
      }
    })

    return NextResponse.json(enrichedRows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/pip — Initiate a new PIP
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user as any)?.role !== 'master') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const {
      agent_name,
      start_date,
      end_date,
      target_score,
      current_avg_score,
      check_in_frequency,
      attachment_path,
      notes,
    } = body

    if (!agent_name || !start_date || !end_date || !target_score) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Restrict to allowed VA Intake Reps only (must exist in users table)
    const db = getDb()
    const users = db.prepare('SELECT display_name FROM users').all() as { display_name: string }[]
    const allowedAgents = users.map(u => u.display_name).filter(Boolean)
    const agentNameNormalized = agent_name.trim().replace(/\s+/g, '').toLowerCase()
    const isAllowed = allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === agentNameNormalized)
    if (!isAllowed) {
      return NextResponse.json({ error: `Agent "${agent_name}" is not a registered user.` }, { status: 400 })
    }
    const creatorName = session.user?.name || 'QA Admin'

    const stmt = db.prepare(`
      INSERT INTO pip_plans (
        agent_name, creator_name, start_date, end_date, target_score,
        current_avg_score, check_in_frequency, attachment_path, notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
    `)

    const result = stmt.run(
      agent_name,
      creatorName,
      start_date,
      end_date,
      Number(target_score),
      current_avg_score != null ? Number(current_avg_score) : null,
      check_in_frequency || null,
      attachment_path || null,
      notes || null
    )

    // Notify the agent in real-time
    const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(agent_name) as { username: string } | undefined
    const recipientUsername = user?.username || agent_name.toLowerCase().replace(/\s+/g, '')

    sendNotification({
      username: recipientUsername,
      title: '📋 PIP Plan Initiated',
      message: `A formal Performance Improvement Plan (PIP) has been initiated for you by ${creatorName}. Target average score: ${target_score}%.`,
      link: '/coaching'
    })

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/pip — Update PIP status
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || (session.user as any)?.role !== 'master') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 })
    }

    if (!['Active', 'Completed - Successful', 'Completed - Unsuccessful'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const db = getDb()
    const plan = db.prepare('SELECT agent_name FROM pip_plans WHERE id = ?').get(id) as { agent_name: string } | undefined
    if (!plan) {
      return NextResponse.json({ error: 'PIP plan not found' }, { status: 404 })
    }

    db.prepare('UPDATE pip_plans SET status = ? WHERE id = ?').run(status, id)

    // Notify the agent in real-time
    const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(plan.agent_name) as { username: string } | undefined
    const recipientUsername = user?.username || plan.agent_name.toLowerCase().replace(/\s+/g, '')

    sendNotification({
      username: recipientUsername,
      title: '📋 PIP Plan Updated',
      message: `Your Performance Improvement Plan (PIP) status has been updated to: ${status}.`,
      link: '/coaching'
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/pip?id=123
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
    db.prepare('DELETE FROM pip_plans WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
