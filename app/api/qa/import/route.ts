import { NextResponse } from 'next/server'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'
import { sendNotification } from '@/lib/notifications'

function getTier(score: number): string {
  if (score >= 90) return 'Top Performer'
  if (score >= 81) return 'Strong Performer'
  if (score >= 70) return 'Developing Performer'
  if (score >= 60) return 'Performance Risk'
  return 'Immediate Coaching Required'
}

function matchAgentName(excelName: string, dbUsers: string[]): string {
  const normalizedExcel = excelName.trim().toLowerCase()
  if (!normalizedExcel) return excelName

  // 1. Try exact match
  for (const dbUser of dbUsers) {
    if (dbUser.trim().toLowerCase() === normalizedExcel) {
      return dbUser
    }
  }

  // 2. Try prefix/substring match (e.g. Alejandra Nicole -> Alejandra NicoleReyes)
  for (const dbUser of dbUsers) {
    const normalizedDb = dbUser.trim().toLowerCase()
    if (normalizedDb.startsWith(normalizedExcel) || normalizedExcel.startsWith(normalizedDb)) {
      return dbUser
    }
  }

  return excelName
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })

    const db = getDb()
    
    // Fetch all user display names to normalize agent names
    const users = db.prepare('SELECT display_name FROM users').all() as { display_name: string }[]
    const dbDisplayNames = users.map(u => u.display_name).filter(Boolean)

    let importedCount = 0
    const details: any[] = []

    // ─── Case 1: Try importing from historical 'RAW' sheet ───
    const rawSheet = wb.Sheets['RAW']
    if (rawSheet) {
      const data: any[][] = XLSX.utils.sheet_to_json(rawSheet, { header: 1, defval: '' })
      
      const insertStmt = db.prepare(`
        INSERT INTO qa_evaluations (
          agent_name, evaluator_name, call_id, eval_date, overall_score,
          score_introduction, score_pk_policies, score_eligibility,
          score_deadline, score_documentation, score_objection,
          zt_attorney_escalation, zt_legal_misrepresentation, zt_undocumented,
          feedback, tier
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      const checkDupStmt = db.prepare(`
        SELECT id FROM qa_evaluations 
        WHERE agent_name = ? 
          AND (call_id = ? OR (call_id IS NULL AND ? IS NULL)) 
          AND eval_date = ?
      `)

      const insertAgentStmt = db.prepare('INSERT OR IGNORE INTO agents (name, active) VALUES (?, 1)')
      const activateAgentStmt = db.prepare('UPDATE agents SET active = 1 WHERE name = ?')

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        // Row needs to have at least an agent name at index 8 and overall score at index 6
        if (!row || row.length < 9) continue
        
        const rawAgentName = (row[8] || '').toString().trim()
        if (!rawAgentName) continue

        const agentName = matchAgentName(rawAgentName, dbDisplayNames)

        // Restrict to allowed VA Intake Reps only
        const allowedAgents = ['Omar Soto', 'Alejandra NicoleReyes', 'Alejandra Nicole Reyes', 'Adriana Soto', 'Oliver Ortega', 'Daniel Castillo']
        const agentNameNormalized = agentName.trim().replace(/\s+/g, '').toLowerCase()
        const isAllowed = allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === agentNameNormalized)
        if (!isAllowed) {
          continue
        }

        const callId = row[9] ? row[9].toString().trim() : null
        
        // Parse date
        let evalDate = ''
        const rawDate = row[10]
        if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
          if (typeof rawDate === 'number') {
            const d = XLSX.SSF.parse_date_code(rawDate)
            evalDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
          } else {
            const parsed = new Date(rawDate)
            if (!isNaN(parsed.getTime())) {
              evalDate = parsed.toISOString().slice(0, 10)
            }
          }
        }
        if (!evalDate) {
          evalDate = new Date().toISOString().slice(0, 10)
        }

        // Check if duplicate already exists
        const dup = checkDupStmt.get(agentName, callId, callId, evalDate)
        if (dup) {
          // Skip duplicate
          continue
        }

        // Ensure agent exists and is active in agents table
        insertAgentStmt.run(agentName)
        activateAgentStmt.run(agentName)

        // Extract category scores
        const scoreIntro = Math.round(Number(row[0] || 0) * 100) / 100
        const scorePk = Math.round(Number(row[1] || 0) * 100) / 100
        const scoreElig = Math.round(Number(row[2] || 0) * 100) / 100
        const scoreDeadline = Math.round(Number(row[3] || 0) * 100) / 100
        const scoreDoc = Math.round(Number(row[4] || 0) * 100) / 100
        const scoreObj = Math.round(Number(row[5] || 0) * 100) / 100

        // Written feedback
        const feedback = row[7] ? row[7].toString().trim() : null

        // Detect Zero Tolerance flags from feedback text
        const feedbackLower = feedback ? feedback.toLowerCase() : ''
        let ztAttorney = 0
        let ztLegal = 0
        let ztUndocumented = 0

        if (feedbackLower.includes('abandoned') || feedbackLower.includes('undocumented')) {
          ztUndocumented = 1
        }
        if (feedbackLower.includes('attorney escalation') || feedbackLower.includes('unauthorized attorney')) {
          ztAttorney = 1
        }
        if (feedbackLower.includes('misrepresentation') || feedbackLower.includes('outcome misrepresent')) {
          ztLegal = 1
        }

        // Parse overall score (e.g. 0.875 -> 87.5)
        const rawOverall = Number(row[6] || 0)
        let overallScore = Math.round((rawOverall <= 1 ? rawOverall * 100 : rawOverall) * 100) / 100
        
        // Zero Tolerance overrides score to 0%
        if (ztAttorney === 1 || ztLegal === 1 || ztUndocumented === 1) {
          overallScore = 0
        }

        const tier = getTier(overallScore)

        insertStmt.run(
          agentName,
          null, // evaluator
          callId,
          evalDate,
          overallScore,
          scoreIntro,
          scorePk,
          scoreElig,
          scoreDeadline,
          scoreDoc,
          scoreObj,
          ztAttorney,
          ztLegal,
          ztUndocumented,
          feedback,
          tier
        )

        // Find matching username and send notification
        const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(agentName) as { username: string } | undefined
        const recipientUsername = user?.username || agentName.toLowerCase().replace(/\s+/g, '')

        sendNotification({
          username: recipientUsername,
          title: 'New QA Evaluation 📋',
          message: `Your evaluation for Call ID ${callId || 'None'} on ${evalDate} has been uploaded with a score of ${overallScore}%.`,
          link: '/qa'
        })

        importedCount++
        details.push({
          agent: agentName,
          score: overallScore,
          tier
        })
      }
    }

    // ─── Case 2: Try importing single template evaluation from 'QA Matrix' sheet ───
    if (importedCount === 0) {
      const matrixSheet = wb.Sheets['QA Matrix']
      if (!matrixSheet) {
        return NextResponse.json({ error: 'Could not find "RAW" or "QA Matrix" sheet in the file.' }, { status: 400 })
      }

      const data: any[][] = XLSX.utils.sheet_to_json(matrixSheet, { header: 1, defval: '' })

      const rawAgentName = (data[2]?.[7] || '').toString().trim()
      if (!rawAgentName) {
        return NextResponse.json({ error: 'Could not find agent name in cell H3 of "QA Matrix"' }, { status: 400 })
      }

      const agentName = matchAgentName(rawAgentName, dbDisplayNames)

      // Restrict to allowed VA Intake Reps only
      const allowedAgents = ['Omar Soto', 'Alejandra NicoleReyes', 'Alejandra Nicole Reyes', 'Adriana Soto', 'Oliver Ortega', 'Daniel Castillo']
      const agentNameNormalized = agentName.trim().replace(/\s+/g, '').toLowerCase()
      const isAllowed = allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === agentNameNormalized)
      if (!isAllowed) {
        return NextResponse.json({ error: `Agent "${agentName}" is not a VA Intake Rep.` }, { status: 400 })
      }

      const callId = (data[1]?.[8] || '').toString().trim() || null

      let evalDate = ''
      const rawDate = data[1]?.[9] || data[2]?.[9] || ''
      if (rawDate) {
        if (typeof rawDate === 'number') {
          const d = XLSX.SSF.parse_date_code(rawDate)
          evalDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
        } else {
          const parsed = new Date(rawDate)
          if (!isNaN(parsed.getTime())) evalDate = parsed.toISOString().slice(0, 10)
        }
      }
      if (!evalDate) evalDate = new Date().toISOString().slice(0, 10)

      // Check if duplicate already exists
      const checkDupStmt = db.prepare(`
        SELECT id FROM qa_evaluations 
        WHERE agent_name = ? 
          AND (call_id = ? OR (call_id IS NULL AND ? IS NULL)) 
          AND eval_date = ?
      `)
      const dup = checkDupStmt.get(agentName, callId, callId, evalDate)
      if (dup) {
        return NextResponse.json({ error: `Evaluation for ${agentName} (Call ID: ${callId || 'None'}, Date: ${evalDate}) already exists.` }, { status: 400 })
      }

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

      const ztAttorney = (data[11]?.[8] || '').toString().trim().toLowerCase() === 'yes'
      const ztLegal = (data[12]?.[8] || '').toString().trim().toLowerCase() === 'yes'
      const ztUndocumented = (data[13]?.[8] || '').toString().trim().toLowerCase() === 'yes'

      let overallScore = 0
      const rawOverall = data[15]?.[1]
      if (typeof rawOverall === 'number') {
        overallScore = rawOverall <= 1 ? rawOverall * 100 : rawOverall
      } else {
        overallScore = scoreIntro + scorePk + scoreElig + scoreDeadline + scoreDoc + scoreObj
      }
      overallScore = Math.round(overallScore * 100) / 100

      // Zero Tolerance overrides score to 0%
      if (ztAttorney || ztLegal || ztUndocumented) {
        overallScore = 0
      }

      const feedbackParts: string[] = []
      for (let r = 1; r < Math.min(data.length, 20); r++) {
        const obs = (data[r]?.[5] || '').toString().trim()
        if (obs) feedbackParts.push(obs)
      }
      const feedback = feedbackParts.join('\n\n')

      const tier = getTier(overallScore)

      // Ensure agent exists and is active in agents table
      db.prepare('INSERT OR IGNORE INTO agents (name, active) VALUES (?, 1)').run(agentName)
      db.prepare('UPDATE agents SET active = 1 WHERE name = ?').run(agentName)

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
        null,
        callId,
        evalDate,
        overallScore,
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

      // Find matching username and send notification
      const user = db.prepare('SELECT username FROM users WHERE display_name = ?').get(agentName) as { username: string } | undefined
      const recipientUsername = user?.username || agentName.toLowerCase().replace(/\s+/g, '')

      sendNotification({
        username: recipientUsername,
        title: 'New QA Evaluation 📋',
        message: `Your evaluation for Call ID ${callId || 'None'} on ${evalDate} has been uploaded with a score of ${overallScore}%.`,
        link: '/qa'
      })

      importedCount++
      details.push({
        agent: agentName,
        score: overallScore,
        tier
      })
    }

    return NextResponse.json({
      success: true,
      imported: importedCount,
      details
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
