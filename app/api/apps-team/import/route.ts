import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import * as xlsx from 'xlsx'

// Helper: Convert Excel Serial Date to YYYY-MM-DD
function parseExcelDate(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10)
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000))
    return dateObj.toISOString().slice(0, 10)
  }
  const dateStr = String(val).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const parsed = new Date(dateStr)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

function normalizeRepInfo(rawName: string): { rep_name: string; rep_username: string } {
  if (!rawName) return { rep_name: 'Apps Rep', rep_username: 'apps_rep' }
  const trimmed = String(rawName).trim()
  const lower = trimmed.toLowerCase()

  if (lower.includes('estefani')) {
    return { rep_name: 'Estefani Cubides', rep_username: 'ecubides' }
  }
  if (lower.includes('samantha')) {
    return { rep_name: 'Samantha Benavides', rep_username: 'sbenavides' }
  }

  const titleCased = trimmed.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  const username = titleCased.toLowerCase().replace(/[^a-z0-9]/g, '')
  return { rep_name: titleCased, rep_username: username }
}

function standardizeReason(rawReason: any): { category: string; other: string } {
  if (!rawReason) return { category: 'Other', other: '' }
  const r = String(rawReason).trim()
  const lower = r.toLowerCase()

  if (lower.includes('wet 827') || lower.includes('wet reps') || lower.includes('wet 828') || lower.includes('wet 829') || lower.includes('wet 3288')) {
    return { category: 'Need Wet 827', other: r }
  }
  if (lower.includes('need reps') || lower.includes('check reps') || lower.includes('paper app')) {
    return { category: 'Need Reps', other: r }
  }
  if (lower.includes('yellow screen') || lower.includes('cc with ssa')) {
    return { category: 'Yellow Screen (CC with SSA scheduled)', other: r }
  }
  if (lower.includes('rejected')) {
    return { category: 'Rejected (While on Application)', other: r }
  }
  return { category: 'Other', other: r }
}

import { isAuthorizedForAppsTeam } from '../route'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAuthorizedForAppsTeam(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = xlsx.read(buffer, { type: 'buffer' })
    const sheetName = workbook.Sheets['Matrix'] ? 'Matrix' : workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = xlsx.utils.sheet_to_json<any>(sheet)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Excel sheet is empty.' }, { status: 400 })
    }

    const db = getDb()

    const upsertEntry = db.prepare(`
      INSERT INTO apps_team_entries (
        lead_id, client_name, date_completed, converted, 
        reason_not_converted, other_reason, rep_username, rep_name, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(lead_id) DO UPDATE SET
        client_name = excluded.client_name,
        date_completed = excluded.date_completed,
        converted = excluded.converted,
        reason_not_converted = excluded.reason_not_converted,
        other_reason = excluded.other_reason,
        rep_username = excluded.rep_username,
        rep_name = excluded.rep_name,
        updated_at = datetime('now')
    `)

    let totalProcessed = 0
    let convertedCount = 0
    let pendingCount = 0

    db.transaction(() => {
      for (const r of rows) {
        const leadIdRaw = r['Lead ID']
        if (!leadIdRaw) continue

        const leadId = String(leadIdRaw).trim()
        const clientName = String(r["Lead's Name"] || 'Unknown Client').trim()
        const rawRepName = String(r['Apps Representative'] || 'Apps Rep').trim()
        const { rep_name: repName, rep_username: repUsername } = normalizeRepInfo(rawRepName)
        const dateCompleted = parseExcelDate(r['Date'])
        
        const convRaw = String(r['Converted'] || 'No').trim().toUpperCase()
        const converted = (convRaw === 'YES' || convRaw === 'SI') ? 'YES' : 'NO'
        
        const rawReason = r['Reason why it was not converted']
        const { category, other } = standardizeReason(rawReason)

        if (converted === 'YES') convertedCount++
        else pendingCount++

        upsertEntry.run(
          leadId,
          clientName,
          dateCompleted,
          converted,
          converted === 'NO' ? category : null,
          converted === 'NO' ? other : null,
          repUsername,
          repName
        )
        totalProcessed++
      }
    })()

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      converted: convertedCount,
      pending: pendingCount,
      message: `Successfully processed ${totalProcessed} application entries (${convertedCount} Converted, ${pendingCount} Pending).`
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
