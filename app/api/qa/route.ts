import { NextResponse } from 'next/server'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// GET /api/qa?agent=Name&from=2025-01-01&to=2025-12-31
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const agent = searchParams.get('agent')
    const from = searchParams.get('from') || '2000-01-01'
    const to = searchParams.get('to') || '2099-12-31'

    const db = getDb()
    let query = `
      SELECT q.* 
      FROM qa_evaluations q
      INNER JOIN agents a ON q.agent_name = a.name
      WHERE a.active = 1
        AND q.eval_date >= ? 
        AND q.eval_date <= ?
    `
    const params: any[] = [from, to]

    if (agent) {
      query += ' AND q.agent_name = ?'
      params.push(agent)
    }

    query += ' ORDER BY q.eval_date DESC'
    const rows = db.prepare(query).all(...params)
    return NextResponse.json(rows)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/qa — save a single evaluation
export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.agent_name) {
      return NextResponse.json({ error: 'Missing agent_name' }, { status: 400 })
    }

    // Restrict to allowed VA Intake Reps only
    const allowedAgents = ['Omar Soto', 'Alejandra NicoleReyes', 'Alejandra Nicole Reyes', 'Adriana Soto', 'Oliver Ortega', 'Daniel Castillo']
    const agentNameNormalized = body.agent_name.trim().replace(/\s+/g, '').toLowerCase()
    const isAllowed = allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === agentNameNormalized)
    if (!isAllowed) {
      return NextResponse.json({ error: `Agent "${body.agent_name}" is not a VA Intake Rep.` }, { status: 400 })
    }

    const db = getDb()

    // Determine tier based on overall_score
    function getTier(score: number): string {
      if (score >= 90) return 'Top Performer'
      if (score >= 81) return 'Strong Performer'
      if (score >= 70) return 'Developing Performer'
      if (score >= 60) return 'Performance Risk'
      return 'Immediate Coaching Required'
    }

    const ztAttorney = body.zt_attorney_escalation ? 1 : 0
    const ztLegal = body.zt_legal_misrepresentation ? 1 : 0
    const ztUndocumented = body.zt_undocumented ? 1 : 0

    let overall = body.overall_score || 0
    if (ztAttorney === 1 || ztLegal === 1 || ztUndocumented === 1) {
      overall = 0
    }

    const tier = getTier(overall)

    // Ensure agent exists and is active in agents table
    db.prepare('INSERT OR IGNORE INTO agents (name, active) VALUES (?, 1)').run(body.agent_name)
    db.prepare('UPDATE agents SET active = 1 WHERE name = ?').run(body.agent_name)

    const stmt = db.prepare(`
      INSERT INTO qa_evaluations (
        agent_name, evaluator_name, call_id, eval_date, overall_score,
        score_introduction, score_pk_policies, score_eligibility,
        score_deadline, score_documentation, score_objection,
        zt_attorney_escalation, zt_legal_misrepresentation, zt_undocumented,
        feedback, tier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      body.agent_name,
      body.evaluator_name || null,
      body.call_id || null,
      body.eval_date,
      overall,
      body.score_introduction || 0,
      body.score_pk_policies || 0,
      body.score_eligibility || 0,
      body.score_deadline || 0,
      body.score_documentation || 0,
      body.score_objection || 0,
      body.zt_attorney_escalation ? 1 : 0,
      body.zt_legal_misrepresentation ? 1 : 0,
      body.zt_undocumented ? 1 : 0,
      body.feedback || null,
      tier
    )

    // Find matching user username in database to send notification
    const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(body.agent_name) as { username: string } | undefined
    const recipientUsername = user?.username || body.agent_name.toLowerCase().replace(/\s+/g, '')

    sendNotification({
      username: recipientUsername,
      title: 'New QA Evaluation 📋',
      message: `You received a new QA score of ${overall}% from ${body.evaluator_name || 'QA Admin'}.`,
      link: '/qa'
    })

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/qa — acknowledge, dispute, or resolve an evaluation
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { action, id } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing evaluation id' }, { status: 400 })
    }

    const db = getDb()
    const evaluation = db.prepare('SELECT * FROM qa_evaluations WHERE id = ?').get(id) as any
    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    const isMaster = (session.user as any)?.role === 'master'
    const isOwner = evaluation.agent_name === session.user?.name

    if (action === 'acknowledge') {
      if (!isMaster && !isOwner) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      db.prepare(`
        UPDATE qa_evaluations
        SET status = 'Acknowledged',
            acknowledged_at = datetime('now')
        WHERE id = ?
      `).run(id)

      return NextResponse.json({ success: true })
    }

    if (action === 'dispute') {
      if (!isMaster && !isOwner) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { dispute_reason } = body
      if (!dispute_reason) {
        return NextResponse.json({ error: 'Missing dispute reason' }, { status: 400 })
      }

      db.prepare(`
        UPDATE qa_evaluations
        SET status = 'Disputed',
            disputed_at = datetime('now'),
            dispute_reason = ?
        WHERE id = ?
      `).run(dispute_reason, id)

      // Notify all master administrators
      const masters = db.prepare("SELECT username FROM users WHERE role = 'master' AND active = 1").all() as { username: string }[]
      for (const master of masters) {
        sendNotification({
          username: master.username,
          title: 'Disputed Evaluation ⚠️',
          message: `${evaluation.agent_name} has disputed an evaluation.`,
          link: '/qa'
        })
      }

      return NextResponse.json({ success: true })
    }

    if (action === 'resolve') {
      if (!isMaster) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { resolutionStatus, resolutionNotes } = body
      if (!resolutionStatus || !['Resolved - Revised', 'Resolved - No Change'].includes(resolutionStatus)) {
        return NextResponse.json({ error: 'Invalid or missing resolution status' }, { status: 400 })
      }

      function getTier(score: number): string {
        if (score >= 90) return 'Top Performer'
        if (score >= 81) return 'Strong Performer'
        if (score >= 70) return 'Developing Performer'
        if (score >= 60) return 'Performance Risk'
        return 'Immediate Coaching Required'
      }

      const ztAttorney = evaluation.zt_attorney_escalation
      const ztLegal = evaluation.zt_legal_misrepresentation
      const ztUndocumented = evaluation.zt_undocumented

      let overall = evaluation.overall_score

      if (resolutionStatus === 'Resolved - Revised') {
        const intro = body.score_introduction !== undefined ? Number(body.score_introduction) : evaluation.score_introduction
        const pk = body.score_pk_policies !== undefined ? Number(body.score_pk_policies) : evaluation.score_pk_policies
        const elig = body.score_eligibility !== undefined ? Number(body.score_eligibility) : evaluation.score_eligibility
        const dead = body.score_deadline !== undefined ? Number(body.score_deadline) : evaluation.score_deadline
        const doc = body.score_documentation !== undefined ? Number(body.score_documentation) : evaluation.score_documentation
        const obj = body.score_objection !== undefined ? Number(body.score_objection) : evaluation.score_objection

        overall = intro + pk + elig + dead + doc + obj
        if (ztAttorney === 1 || ztLegal === 1 || ztUndocumented === 1) {
          overall = 0
        }
        const tier = getTier(overall)

        db.prepare(`
          UPDATE qa_evaluations
          SET status = ?,
              resolved_at = datetime('now'),
              resolution_notes = ?,
              score_introduction = ?,
              score_pk_policies = ?,
              score_eligibility = ?,
              score_deadline = ?,
              score_documentation = ?,
              score_objection = ?,
              overall_score = ?,
              tier = ?
          WHERE id = ?
        `).run(
          resolutionStatus,
          resolutionNotes || null,
          intro,
          pk,
          elig,
          dead,
          doc,
          obj,
          overall,
          tier,
          id
        )
      } else {
        db.prepare(`
          UPDATE qa_evaluations
          SET status = ?,
              resolved_at = datetime('now'),
              resolution_notes = ?
          WHERE id = ?
        `).run(resolutionStatus, resolutionNotes || null, id)
      }

      // Notify the agent
      const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(evaluation.agent_name) as { username: string } | undefined
      const recipientUsername = user?.username || evaluation.agent_name.toLowerCase().replace(/\s+/g, '')

      sendNotification({
        username: recipientUsername,
        title: 'QA Dispute Resolved 📢',
        message: `Your dispute has been resolved: ${resolutionStatus}. Notes: ${resolutionNotes || 'None'}`,
        link: '/qa'
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/qa?id=123
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const db = getDb()
    db.prepare('DELETE FROM qa_evaluations WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
