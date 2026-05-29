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

  const sheetName = 'Acumulado'
  if (!workbook.SheetNames.includes(sheetName)) {
    return NextResponse.json({ error: `Sheet "${sheetName}" not found in workbook` }, { status: 400 })
  }

  const ws = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  // Find header row (row with 'Agent name')
  let headerIdx = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (rows[i].includes('Agent name') || rows[i].includes('agent_name')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    return NextResponse.json({ error: 'Could not find header row in Acumulado sheet' }, { status: 400 })
  }

  const headers: string[] = rows[headerIdx]
  const dataRows = rows.slice(headerIdx + 1)

  // Map column indices
  const col = (name: string) => headers.findIndex((h) => h && h.toString().toLowerCase().includes(name.toLowerCase()))
  const iDate = col('DATE')
  const iAgent = col('Agent name')
  const iCapd = col('CAPD')
  const iInbound = col('Inbound')
  const iRejected = col('Rejected')
  const iCrh = col('CRH')
  const iSigned = col('Signed Retainers')
  const iUnsigned = col('Unsigned')
  const iTotal = col('Total Case')
  const iRate = col('success rate')
  const iWeek = col('Semana')
  const iPresent = col('Presente')

  const db = getDb()

  const insert = db.prepare(`
    INSERT INTO daily_performance (
      date, agent_name, capd, inbound_calls, case_rejected, crh,
      signed_retainers, unsigned_retainers, total_case_wanted,
      signed_success_rate, week_label, present
    ) VALUES (
      @date, @agent_name, @capd, @inbound_calls, @case_rejected, @crh,
      @signed_retainers, @unsigned_retainers, @total_case_wanted,
      @signed_success_rate, @week_label, @present
    )
    ON CONFLICT(date, agent_name) DO UPDATE SET
      capd = excluded.capd,
      inbound_calls = excluded.inbound_calls,
      case_rejected = excluded.case_rejected,
      crh = excluded.crh,
      signed_retainers = excluded.signed_retainers,
      unsigned_retainers = excluded.unsigned_retainers,
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

      const signed = Number(row[iSigned]) || 0
      const unsigned = Number(row[iUnsigned]) || 0
      const total = signed + unsigned

      insert.run({
        date: dateStr,
        agent_name: String(row[iAgent]).trim(),
        capd: Number(row[iCapd]) || 0,
        inbound_calls: Number(row[iInbound]) || 0,
        case_rejected: Number(row[iRejected]) || 0,
        crh: Number(row[iCrh]) || 0,
        signed_retainers: signed,
        unsigned_retainers: unsigned,
        total_case_wanted: total,
        signed_success_rate: total > 0 ? signed / total : 0,
        week_label: String(row[iWeek] || ''),
        present: String(row[iPresent] || 'SI'),
      })
      imported++
    }
  })

  importAll()

  return NextResponse.json({ success: true, imported, skipped })
}
