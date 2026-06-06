import { NextResponse } from 'next/server'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'

function getTier(score: number): string {
  if (score >= 90) return 'Top Performer'
  if (score >= 81) return 'Strong Performer'
  if (score >= 70) return 'Developing Performer'
  if (score >= 60) return 'Performance Risk'
  return 'Immediate Coaching Required'
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })

    const ws = wb.Sheets['QA Matrix']
    if (!ws) return NextResponse.json({ error: 'Sheet "QA Matrix" not found' }, { status: 400 })

    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // Extract evaluation metadata
    const agentName = (data[2]?.[7] || '').toString().trim()
    if (!agentName) return NextResponse.json({ error: 'Could not find agent name in cell H3' }, { status: 400 })

    const callId = (data[1]?.[8] || '').toString().trim()

    // Try to get date from the sheet, fall back to today
    let evalDate = ''
    const rawDate = data[1]?.[9] || data[2]?.[9] || ''
    if (rawDate) {
      if (typeof rawDate === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(rawDate)
        evalDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      } else {
        const parsed = new Date(rawDate)
        if (!isNaN(parsed.getTime())) evalDate = parsed.toISOString().slice(0, 10)
      }
    }
    if (!evalDate) evalDate = new Date().toISOString().slice(0, 10)

    // Category scores from the criteria score column (col 3)
    // Each category has a max score. We check if criteria were met (col 2 = 'Yes')
    // and compute proportional scores.

    // Define category rows and their max scores:
    // Introduction (rows 1-3): max 20, 3 criteria
    // PK & Policies (rows 4-7): max 25, 4 criteria
    // Eligibility (rows 8-10): max 20, 3 criteria
    // Deadline (row 11): max 10, 1 criterion
    // Documentation (rows 12-13): max 15, 2 criteria
    // Objection (row 14): max 10, 1 criterion

    function countMet(startRow: number, endRow: number): { met: number; total: number } {
      let met = 0, total = 0
      for (let r = startRow; r <= endRow; r++) {
        if (data[r] && data[r][1] && data[r][1].toString().trim()) {
          total++
          const val = (data[r][2] || '').toString().trim().toLowerCase()
          if (val === 'yes' || val === 'sí' || val === 'si') met++
        }
      }
      return { met, total: total || 1 }
    }

    const intro = countMet(1, 3)
    const pk = countMet(4, 7)
    const elig = countMet(8, 10)
    const deadline = countMet(11, 11)
    const doc = countMet(12, 13)
    const objection = countMet(14, 14)

    const scoreIntro = (intro.met / intro.total) * 20
    const scorePk = (pk.met / pk.total) * 25
    const scoreElig = (elig.met / elig.total) * 20
    const scoreDeadline = (deadline.met / deadline.total) * 10
    const scoreDoc = (doc.met / doc.total) * 15
    const scoreObj = (objection.met / objection.total) * 10

    // Overall score: try to read from row 15, col 1, otherwise compute
    let overallScore = 0
    const rawOverall = data[15]?.[1]
    if (typeof rawOverall === 'number') {
      overallScore = rawOverall <= 1 ? rawOverall * 100 : rawOverall
    } else {
      overallScore = scoreIntro + scorePk + scoreElig + scoreDeadline + scoreDoc + scoreObj
    }

    // Zero tolerance flags
    const ztAttorney = (data[11]?.[8] || '').toString().trim().toLowerCase() === 'yes'
    const ztLegal = (data[12]?.[8] || '').toString().trim().toLowerCase() === 'yes'
    const ztUndocumented = (data[13]?.[8] || '').toString().trim().toLowerCase() === 'yes'

    // Feedback: collect observations from column 5
    const feedbackParts: string[] = []
    for (let r = 1; r < Math.min(data.length, 20); r++) {
      const obs = (data[r]?.[5] || '').toString().trim()
      if (obs) feedbackParts.push(obs)
    }
    const feedback = feedbackParts.join('\n\n')

    const tier = getTier(overallScore)

    // Save to database
    const db = getDb()
    const stmt = db.prepare(`
      INSERT INTO qa_evaluations (
        agent_name, evaluator_name, call_id, eval_date, overall_score,
        score_introduction, score_pk_policies, score_eligibility,
        score_deadline, score_documentation, score_objection,
        zt_attorney_escalation, zt_legal_misrepresentation, zt_undocumented,
        feedback, tier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      agentName,
      null, // evaluator not in the sheet
      callId,
      evalDate,
      Math.round(overallScore * 100) / 100,
      Math.round(scoreIntro * 100) / 100,
      Math.round(scorePk * 100) / 100,
      Math.round(scoreElig * 100) / 100,
      Math.round(scoreDeadline * 100) / 100,
      Math.round(scoreDoc * 100) / 100,
      Math.round(scoreObj * 100) / 100,
      ztAttorney ? 1 : 0,
      ztLegal ? 1 : 0,
      ztUndocumented ? 1 : 0,
      feedback || null,
      tier
    )

    return NextResponse.json({
      success: true,
      evaluation: {
        agent_name: agentName,
        call_id: callId,
        eval_date: evalDate,
        overall_score: Math.round(overallScore * 100) / 100,
        tier,
        categories: {
          introduction: Math.round(scoreIntro * 100) / 100,
          pk_policies: Math.round(scorePk * 100) / 100,
          eligibility: Math.round(scoreElig * 100) / 100,
          deadline: Math.round(scoreDeadline * 100) / 100,
          documentation: Math.round(scoreDoc * 100) / 100,
          objection: Math.round(scoreObj * 100) / 100,
        },
        zero_tolerance: { ztAttorney, ztLegal, ztUndocumented },
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
