import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import * as XLSX from 'xlsx'
import { isAuthorizedSsdTeamLead } from '../route'
import { validateFileUpload, sanitizeCellText, recordUploadAudit } from '@/lib/security'

function parseIdleTimeDate(dateVal: any): string {
  if (!dateVal) return new Date().toISOString().split('T')[0]
  if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0]
  if (typeof dateVal === 'number') {
    const d = XLSX.SSF.parse_date_code(dateVal)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  const str = String(dateVal).trim()
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }
  const parts = str.split(' ')[0].split(/[-/]/)
  if (parts.length === 3) {
    let year = parts[2]
    if (year.length === 2) year = '20' + year
    return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  }
  return new Date().toISOString().split('T')[0]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAuthorizedSsdTeamLead(session)) {
    return NextResponse.json({ error: 'Forbidden: Only SSD Team Leads and Admins can sync converted cases' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  const sessionUsername = (session.user as any)?.email || (session.user as any)?.username || 'user'
  const sessionDisplayName = session.user?.name || sessionUsername
  const userId = (session.user as any)?.id || null

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Security Suite Validation
  const validation = validateFileUpload(buffer, file.name, { allowedTypes: ['xlsx', 'xls'] })
  if (!validation.isValid) {
    recordUploadAudit({
      userId,
      username: sessionUsername,
      userName: sessionDisplayName,
      uploadType: 'ssd_converted',
      filename: file.name,
      buffer,
      rowsProcessed: 0,
      status: 'REJECTED',
      details: validation.error,
    })
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' })
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to parse Excel file: ${err.message}` }, { status: 400 })
  }

  // Look for "Status Report" or first sheet
  const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('status')) || workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 })

  if (rawRows.length < 2) {
    return NextResponse.json({ error: 'Spreadsheet is empty or missing data rows' }, { status: 400 })
  }

  const headerRow = rawRows[0].map((h: any) => String(h || '').trim().toLowerCase())

  // Find column indices
  let iLeadId = headerRow.findIndex((h: string) => h === 'leadid' || h === 'lead id' || h.includes('leadid') || h.includes('lead id'))
  let iFirstName = headerRow.findIndex((h: string) => h.includes('first name'))
  let iLastName = headerRow.findIndex((h: string) => h.includes('last name'))
  let iIdleTime = headerRow.findIndex((h: string) => h.includes('idle time') || h.includes('idle'))
  let iAssignee = headerRow.findIndex((h: string) => h.includes('current assignee') || h.includes('assignee') || h.includes('rep'))
  let iTags = headerRow.findIndex((h: string) => h.includes('tag') || h.includes('claim'))

  if (iLeadId === -1) iLeadId = 0
  if (iFirstName === -1) iFirstName = 1
  if (iLastName === -1) iLastName = 3
  if (iIdleTime === -1) iIdleTime = 15
  if (iAssignee === -1) iAssignee = 21

  const dataRows = rawRows.slice(1)
  const db = getDb()

  // Active users map for canonical display names
  const userRows = db.prepare(`SELECT display_name, username, lob FROM users WHERE active = 1`).all() as { display_name: string; username: string; lob: string }[]
  const agentLookup = new Map<string, { display_name: string; username: string; lob: string }>()
  for (const u of userRows) {
    if (u.display_name) {
      agentLookup.set(u.display_name.toLowerCase().trim(), u)
      agentLookup.set(u.display_name.toLowerCase().replace(/[^a-z0-9]/g, ''), u)
    }
    if (u.username) {
      agentLookup.set(u.username.toLowerCase().trim(), u)
      agentLookup.set(u.username.toLowerCase().replace(/[^a-z0-9]/g, ''), u)
    }
  }

  function getCanonicalRepName(rawName: string) {
    if (!rawName) return rawName
    const clean = rawName.toLowerCase().trim()
    if (agentLookup.has(clean)) return agentLookup.get(clean)!.display_name
    const stripped = clean.replace(/[^a-z0-9]/g, '')
    if (agentLookup.has(stripped)) return agentLookup.get(stripped)!.display_name
    return rawName.trim()
  }

  const batchId = `batch_ssd_converted_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  let convertedSynced = 0
  const dailyConvertedMap: Record<string, Record<string, number>> = {} // date -> rep -> count

  for (const row of dataRows) {
    if (!row || !Array.isArray(row) || row.length === 0) continue

    const assigneeRaw = row[iAssignee] ? String(row[iAssignee]).trim() : sessionDisplayName
    const repName = getCanonicalRepName(assigneeRaw || sessionDisplayName)
    const convertDate = parseIdleTimeDate(row[iIdleTime])

    convertedSynced++

    // Tally for daily_performance
    if (!dailyConvertedMap[convertDate]) dailyConvertedMap[convertDate] = {}
    dailyConvertedMap[convertDate][repName] = (dailyConvertedMap[convertDate][repName] || 0) + 1
  }

  const snapshotList: any[] = []
  let recordsUpdated = 0
  let recordsCreated = 0

  const syncTransaction = db.transaction(() => {
    // Upsert into daily_performance so Dashboard converted_cases count matches
    for (const [dateStr, reps] of Object.entries(dailyConvertedMap)) {
      for (const [rep, count] of Object.entries(reps)) {
        const existingRow = db.prepare(`
          SELECT id, converted_cases FROM daily_performance WHERE date = ? AND LOWER(TRIM(agent_name)) = LOWER(TRIM(?))
        `).get(dateStr, rep) as any

        if (existingRow) {
          snapshotList.push({
            table: 'daily_performance',
            id: existingRow.id,
            previous_converted_cases: existingRow.converted_cases,
          })

          db.prepare(`
            UPDATE daily_performance SET
              converted_cases = MAX(COALESCE(converted_cases, 0), ?)
            WHERE id = ?
          `).run(count, existingRow.id)
          recordsUpdated++
        } else {
          const insertRes = db.prepare(`
            INSERT INTO daily_performance (
              date, agent_name, capd, inbound_calls, case_rejected, crh, signed_retainers, unsigned_retainers, converted_cases, rfc_sent, present
            ) VALUES (
              ?, ?, 0, 0, 0, 0, 0, 0, ?, 0, 'Present'
            )
          `).run(dateStr, rep, count)

          snapshotList.push({
            table: 'daily_performance',
            id: insertRes.lastInsertRowid,
            created: true,
          })
          recordsCreated++
        }
      }
    }

    // Save batch record in import_batches
    db.prepare(`
      INSERT INTO import_batches (
        batch_id, lob, upload_type, filename, user_id, username, user_name,
        records_created, records_updated, snapshot_data, status
      ) VALUES (?, 'SSD', 'ssd_converted_sync', ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `).run(
      batchId,
      file.name,
      userId,
      sessionUsername,
      sessionDisplayName,
      recordsCreated,
      recordsUpdated,
      snapshotList.length > 0 ? JSON.stringify(snapshotList) : null
    )
  })

  try {
    syncTransaction()

    recordUploadAudit({
      userId,
      username: sessionUsername,
      userName: sessionDisplayName,
      uploadType: 'ssd_converted',
      filename: file.name,
      buffer,
      rowsProcessed: convertedSynced,
      status: 'SUCCESS',
      details: `Batch ${batchId}: Synced ${convertedSynced} converted cases across daily performance.`,
    })

    return NextResponse.json({
      success: true,
      batch_id: batchId,
      converted_synced: convertedSynced,
      message: `Successfully processed ${convertedSynced} converted cases and updated Intake Rep daily performance.`,
    })
  } catch (err: any) {
    console.error('[ssd-tracker import-converted error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to sync converted cases' }, { status: 500 })
  }
}
