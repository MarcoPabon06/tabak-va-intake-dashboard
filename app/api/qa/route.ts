import { NextResponse } from 'next/server'
import getDb from '@/lib/db'

// GET /api/qa?agent=Name&from=2025-01-01&to=2025-12-31
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const agent = searchParams.get('agent')
    const from = searchParams.get('from') || '2000-01-01'
    const to = searchParams.get('to') || '2099-12-31'

    const db = getDb()
    let query = 'SELECT * FROM qa_evaluations WHERE eval_date >= ? AND eval_date <= ?'
    const params: any[] = [from, to]

    if (agent) {
      query += ' AND agent_name = ?'
      params.push(agent)
    }

    query += ' ORDER BY eval_date DESC'
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
    const db = getDb()

    // Determine tier based on overall_score
    function getTier(score: number): string {
      if (score >= 90) return 'Top Performer'
      if (score >= 81) return 'Strong Performer'
      if (score >= 70) return 'Developing Performer'
      if (score >= 60) return 'Performance Risk'
      return 'Immediate Coaching Required'
    }

    const overall = body.overall_score || 0
    const tier = getTier(overall)

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

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
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
