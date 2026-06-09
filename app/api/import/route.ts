import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  let sheetName = 'Acumulado'
  if (!workbook.SheetNames.includes(sheetName)) {
    const alternate = workbook.SheetNames.find(n => n.toLowerCase().replace(/\s+/g, '') === 'grandtotal')
    if (alternate) {
      sheetName = alternate
    } else {
      sheetName = workbook.SheetNames[0]
    }
  }

  if (!sheetName) {
    return NextResponse.json({ error: 'No sheet found in workbook' }, { status: 400 })
  }

  const ws = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Find header row (row with agent/specialist and date/performance indicators)
  let headerIdx = -1
  const agentCandidates = ['agent name', 'agent_name', 'agent', 'rep', 'specialist', 'nombre', 'especialista', 'asesor']
  const validationCandidates = ['date', 'fecha', 'signed', 'firmado', 'capd', 'present', 'presente', 'week', 'semana', 'transferred', 'converted', 'rfc']

  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i]
    if (!Array.isArray(row)) continue

    const hasAgent = row.some(cell => {
      if (cell === null || cell === undefined) return false
      const val = cell.toString().trim().toLowerCase()
      return agentCandidates.some(c => val === c || val.includes(c))
    })

    const hasValidation = row.some(cell => {
      if (cell === null || cell === undefined) return false
      const val = cell.toString().trim().toLowerCase()
      return validationCandidates.some(c => val === c || val.includes(c))
    })

    if (hasAgent && hasValidation) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    return NextResponse.json({ error: `Could not find header row in sheet "${sheetName}"` }, { status: 400 })
  }

  const headers: any[] = rows[headerIdx]
  const dataRows = rows.slice(headerIdx + 1)

  // Map column indices with robust candidate matching
  const findColumn = (candidates: string[]) => {
    return headers.findIndex((h) => {
      if (h === null || h === undefined) return false
      const val = h.toString().trim().toLowerCase()
      return candidates.some(c => val === c || val.includes(c))
    })
  }

  const iDate = findColumn(['date', 'fecha'])
  const iAgent = findColumn(['agent name', 'agent_name', 'agent', 'rep', 'specialist', 'nombre', 'especialista', 'asesor'])
  const iCapd = findColumn(['capd'])
  const iInbound = findColumn(['inbound', 'entrante'])
  const iRejected = findColumn(['rejected', 'reject', 'rechazad'])
  const iCrh = findColumn(['crh', 'refused'])
  const iSigned = findColumn(['signed', 'firmado', 'signed retainers'])
  const iUnsigned = findColumn(['unsigned', 'unsign', 'no firmado'])
  const iConverted = findColumn(['transferred', 'converted', 'convertido', 'transferido'])
  const iRfc = findColumn(['rfc'])
  const iWeek = findColumn(['week', 'semana'])
  const iPresent = findColumn(['present', 'presente'])

  if (iDate === -1 || iAgent === -1) {
    return NextResponse.json({ error: `Could not identify required columns (Date and Agent Name) in sheet "${sheetName}"` }, { status: 400 })
  }

  // Detect SSD sheet: if Converted/Transferred or RFC exists
  const isSSDSheet = iConverted !== -1 || iRfc !== -1

  const db = getDb()

  const insert = db.prepare(`
    INSERT INTO daily_performance (
      date, agent_name, capd, inbound_calls, case_rejected, crh,
      signed_retainers, unsigned_retainers, converted_cases, rfc_sent, total_case_wanted,
      signed_success_rate, week_label, present
    ) VALUES (
      @date, @agent_name, @capd, @inbound_calls, @case_rejected, @crh,
      @signed_retainers, @unsigned_retainers, @converted_cases, @rfc_sent, @total_case_wanted,
      @signed_success_rate, @week_label, @present
    )
    ON CONFLICT(date, agent_name) DO UPDATE SET
      capd = excluded.capd,
      inbound_calls = excluded.inbound_calls,
      case_rejected = excluded.case_rejected,
      crh = excluded.crh,
      signed_retainers = excluded.signed_retainers,
      unsigned_retainers = excluded.unsigned_retainers,
      converted_cases = excluded.converted_cases,
      rfc_sent = excluded.rfc_sent,
      total_case_wanted = excluded.total_case_wanted,
      signed_success_rate = excluded.signed_success_rate,
      week_label = excluded.week_label,
      present = excluded.present
  `)

  let imported = 0
  let skipped = 0

  const importAll = db.transaction(() => {
    for (const row of dataRows) {
      if (!row[iAgent]) { skipped++; continue }

      let dateVal = row[iDate]
      let dateStr: string

      if (dateVal instanceof Date) {
        dateStr = dateVal.toISOString().split('T')[0]
      } else if (typeof dateVal === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(dateVal)
        dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      } else if (typeof dateVal === 'string') {
        dateStr = dateVal.split('T')[0]
      } else {
        skipped++; continue
      }

      const signed = iSigned !== -1 ? Number(row[iSigned]) || 0 : 0

      if (isSSDSheet) {
        const converted = iConverted !== -1 ? Number(row[iConverted]) || 0 : 0
        const rfc = iRfc !== -1 ? Number(row[iRfc]) || 0 : 0
        
        insert.run({
          date: dateStr,
          agent_name: String(row[iAgent]).trim(),
          capd: iCapd !== -1 ? Number(row[iCapd]) || 0 : 0,
          inbound_calls: iInbound !== -1 ? Number(row[iInbound]) || 0 : 0,
          case_rejected: iRejected !== -1 ? Number(row[iRejected]) || 0 : 0,
          crh: iCrh !== -1 ? Number(row[iCrh]) || 0 : 0,
          signed_retainers: signed,
          unsigned_retainers: 0,
          converted_cases: converted,
          rfc_sent: rfc,
          total_case_wanted: signed,
          signed_success_rate: signed > 0 ? converted / signed : 0,
          week_label: iWeek !== -1 ? String(row[iWeek] || '') : '',
          present: iPresent !== -1 ? String(row[iPresent] || 'SI') : 'SI',
        })
      } else {
        const unsigned = iUnsigned !== -1 ? Number(row[iUnsigned]) || 0 : 0
        const total = signed + unsigned

        insert.run({
          date: dateStr,
          agent_name: String(row[iAgent]).trim(),
          capd: iCapd !== -1 ? Number(row[iCapd]) || 0 : 0,
          inbound_calls: iInbound !== -1 ? Number(row[iInbound]) || 0 : 0,
          case_rejected: iRejected !== -1 ? Number(row[iRejected]) || 0 : 0,
          crh: iCrh !== -1 ? Number(row[iCrh]) || 0 : 0,
          signed_retainers: signed,
          unsigned_retainers: unsigned,
          converted_cases: 0,
          rfc_sent: 0,
          total_case_wanted: total,
          signed_success_rate: total > 0 ? signed / total : 0,
          week_label: iWeek !== -1 ? String(row[iWeek] || '') : '',
          present: iPresent !== -1 ? String(row[iPresent] || 'SI') : 'SI',
        })
      }
      
      imported++
    }
  })

  importAll()

  return NextResponse.json({ success: true, imported, skipped })
}
