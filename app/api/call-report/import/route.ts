import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'

function parseDateString(str: string): string {
  str = str.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.split('T')[0]

  const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (match) {
    let p1 = match[1].padStart(2, '0')
    let p2 = match[2].padStart(2, '0')
    let y = match[3]
    if (y.length === 2) y = '20' + y
    if (parseInt(p1) > 12) {
      return `${y}-${p2}-${p1}`
    } else {
      return `${y}-${p1}-${p2}`
    }
  }

  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }
  return str
}

// Name Normalization & Alias Engine
export function normalizeAgentName(raw: string, activeAgents: string[] = []): string {
  if (!raw) return 'Unknown'
  const trimmed = raw.trim()
  const clean = trimmed.toLowerCase()

  // Hardcoded alias matches for common CRM typos
  if (clean.includes('daniel') && (clean.includes('castill') || clean.includes('castillo'))) {
    return 'Daniel Castillo'
  }
  if (clean.includes('alejandra') && clean.includes('reyes')) {
    return 'Alejandra NicoleReyes'
  }
  if (clean.includes('adriana') && clean.includes('soto')) {
    return 'Adriana Soto'
  }
  if (clean.includes('oliver') && clean.includes('ortega')) {
    return 'Oliver Ortega'
  }
  if (clean.includes('omar') && clean.includes('soto')) {
    return 'Omar Soto'
  }

  // Dynamic matching against active agents list
  for (const agent of activeAgents) {
    const agentClean = agent.toLowerCase().replace(/\s+/g, '')
    const inputClean = clean.replace(/\s+/g, '')
    if (agentClean === inputClean || agentClean.startsWith(inputClean) || inputClean.startsWith(agentClean)) {
      return agent
    }
  }

  return trimmed
}

// POST /api/call-report/import — Parse CRM Call Report and update CAPD / Inbound in daily_performance
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const perms = (session?.user as any)?.permissions
  const isAllowed = role === 'master' || role === 'superadmin' || (role === 'admin' && (perms?.canManageDailyEntry ?? true))
  if (!session || !isAllowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const syncLeads = formData.get('syncLeads') === 'true'

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  // Find target sheet (Call Report or first sheet)
  let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('call')) || workbook.SheetNames[0]
  if (!sheetName) {
    return NextResponse.json({ error: 'No sheet found in Excel workbook' }, { status: 400 })
  }

  const ws = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Spreadsheet is empty' }, { status: 400 })
  }

  // Find header row
  let headerIdx = -1
  const agentCandidates = ['agents', 'agent', 'agent name', 'rep', 'specialist', 'user', 'asesor']
  const callCandidates = ['call direction', 'direction', 'duration', 'ring time', 'time', 'leadid', 'call sid']

  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue
    const hasAgent = row.some(cell => {
      if (!cell) return false
      const val = cell.toString().trim().toLowerCase()
      return agentCandidates.some(c => val === c || val.includes(c))
    })
    const hasCall = row.some(cell => {
      if (!cell) return false
      const val = cell.toString().trim().toLowerCase()
      return callCandidates.some(c => val === c || val.includes(c))
    })
    if (hasAgent && hasCall) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    headerIdx = 0
  }

  const headers: any[] = rows[headerIdx] || []
  const dataRows = rows.slice(headerIdx + 1)

  const findCol = (candidates: string[], fallbackIdx: number) => {
    let idx = headers.findIndex((h) => {
      if (!h) return false
      const str = h.toString().trim().toLowerCase()
      return candidates.some((c) => str === c)
    })
    if (idx === -1) {
      idx = headers.findIndex((h) => {
        if (!h) return false
        const str = h.toString().trim().toLowerCase()
        return candidates.some((c) => str.includes(c))
      })
    }
    return idx !== -1 ? idx : fallbackIdx
  }

  const iAgent = findCol(['agents', 'agent', 'agent name', 'rep'], 0)
  const iLeadId = findCol(['leadid', 'lead id', 'lead_id'], 1)
  const iCallerName = findCol(['lead/caller name', 'caller name', 'lead name', 'client name', 'veteran'], 3)
  const iTime = findCol(['time', 'call time', 'date', 'timestamp'], 8)
  const iStatus = findCol(['status', 'call status'], 11)
  const iDirection = findCol(['call direction', 'direction'], 13)

  const db = getDb()

  // Get active VA agents from users table for reference
  const activeDbAgents = db.prepare("SELECT display_name FROM users WHERE role = 'regular' AND active = 1 AND lob = 'VA'").all() as { display_name: string }[]
  const activeAgentNames = activeDbAgents.map(a => a.display_name).filter(Boolean)

  interface AgentDateGroup {
    date: string
    agent_name: string
    total_calls: number
    inbound_calls: number
    outbound_calls: number
    leads: any[]
  }

  const grouped: Record<string, AgentDateGroup> = {}
  let totalProcessedRows = 0

  for (const row of dataRows) {
    if (!row || !Array.isArray(row) || row.length === 0) continue
    const rawAgent = row[iAgent] ? String(row[iAgent]).trim() : ''
    if (!rawAgent) continue

    const normalizedAgent = normalizeAgentName(rawAgent, activeAgentNames)

    let dateVal = row[iTime]
    let dateStr = ''

    if (dateVal instanceof Date) {
      dateStr = dateVal.toISOString().split('T')[0]
    } else if (typeof dateVal === 'number') {
      const d = XLSX.SSF.parse_date_code(dateVal)
      dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
    } else if (typeof dateVal === 'string') {
      const firstPart = dateVal.split(' ')[0]
      dateStr = parseDateString(firstPart)
    } else {
      dateStr = new Date().toISOString().split('T')[0]
    }

    const direction = row[iDirection] ? String(row[iDirection]).trim() : 'Outbound'
    const isInbound = direction.toLowerCase().includes('inbound')

    const leadId = row[iLeadId] ? String(row[iLeadId]).trim() : null
    const callerName = row[iCallerName] ? String(row[iCallerName]).trim() : null
    const status = row[iStatus] ? String(row[iStatus]).trim() : null

    const key = `${dateStr}___${normalizedAgent}`
    if (!grouped[key]) {
      grouped[key] = {
        date: dateStr,
        agent_name: normalizedAgent,
        total_calls: 0,
        inbound_calls: 0,
        outbound_calls: 0,
        leads: [],
      }
    }

    grouped[key].total_calls++
    if (isInbound) {
      grouped[key].inbound_calls++
    } else {
      grouped[key].outbound_calls++
    }

    if (leadId || callerName) {
      grouped[key].leads.push({
        lead_id: leadId,
        caller_name: callerName,
        status: status,
        date: dateStr,
      })
    }

    totalProcessedRows++
  }

  // Upsert into daily_performance table
  const upsertPerf = db.prepare(`
    INSERT INTO daily_performance (
      date, agent_name, capd, inbound_calls, present, week_label
    ) VALUES (
      @date, @agent_name, @capd, @inbound_calls, 'SI', @week_label
    )
    ON CONFLICT(date, agent_name) DO UPDATE SET
      capd = excluded.capd,
      inbound_calls = excluded.inbound_calls,
      present = 'SI'
  `)

  const summaryResults: any[] = []

  const updateDb = db.transaction(() => {
    for (const group of Object.values(grouped)) {
      upsertPerf.run({
        date: group.date,
        agent_name: group.agent_name,
        capd: group.total_calls,
        inbound_calls: group.inbound_calls,
        week_label: '',
      })

      summaryResults.push({
        date: group.date,
        agent_name: group.agent_name,
        capd: group.total_calls,
        inbound_calls: group.inbound_calls,
        outbound_calls: group.outbound_calls,
      })
    }
  })

  updateDb()

  return NextResponse.json({
    success: true,
    total_calls_processed: totalProcessedRows,
    agent_summaries: summaryResults,
  })
}
