import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { isAuthorizedForSsdTracker, isAuthorizedSsdTeamLead } from '../route'

// GET /api/ssd-tracker/converted-cases
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isAuthorizedForSsdTracker(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from') || ''
    const to = searchParams.get('to') || ''
    const selectedRep = searchParams.get('rep') || ''
    const search = (searchParams.get('search') || '').trim()
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limitParam = searchParams.get('limit') || '50'
    const limit = limitParam === 'all' ? -1 : Math.max(parseInt(limitParam, 10) || 50, 1)
    const offset = limit === -1 ? 0 : Math.max((page - 1) * limit, 0)

    const db = getDb()

    // 1. Build Query Filters
    const conditions: string[] = []
    const params: any[] = []

    if (from) {
      const cleanFrom = from.trim().slice(0, 10)
      conditions.push(`SUBSTR(date_converted, 1, 10) >= ?`)
      params.push(cleanFrom)
    }

    if (to) {
      const cleanTo = to.trim().slice(0, 10)
      conditions.push(`SUBSTR(date_converted, 1, 10) <= ?`)
      params.push(cleanTo)
    }

    if (selectedRep && selectedRep !== 'All') {
      conditions.push(`(LOWER(TRIM(rep_name)) = LOWER(TRIM(?)) OR LOWER(TRIM(rep_username)) = LOWER(TRIM(?)))`)
      params.push(selectedRep, selectedRep)
    }

    if (search) {
      conditions.push(`(lead_id LIKE ? OR client_name LIKE ? OR rep_name LIKE ?)`)
      const searchPattern = `%${search}%`
      params.push(searchPattern, searchPattern, searchPattern)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // 2. Count Total Matching Records
    const countSql = `SELECT COUNT(*) as total FROM ssd_converted_records ${whereClause}`
    const totalRow = db.prepare(countSql).get(...params) as { total: number }
    const totalRecords = totalRow ? totalRow.total : 0

    // 3. Fetch Paginated Records
    let recordsSql = `
      SELECT id, lead_id, client_name, date_converted, rep_name, rep_username, raw_tags, import_batch_id, imported_by, created_at
      FROM ssd_converted_records
      ${whereClause}
      ORDER BY date_converted DESC, id DESC
    `
    const recordsParams = [...params]
    if (limit !== -1) {
      recordsSql += ` LIMIT ? OFFSET ?`
      recordsParams.push(limit, offset)
    }

    const records = db.prepare(recordsSql).all(...recordsParams)

    // 4. Compute High-Level Summary Stats for the filtered period
    const summaryParams: any[] = []
    const summaryConditions: string[] = []

    if (from) {
      summaryConditions.push(`SUBSTR(date_converted, 1, 10) >= ?`)
      summaryParams.push(from.trim().slice(0, 10))
    }
    if (to) {
      summaryConditions.push(`SUBSTR(date_converted, 1, 10) <= ?`)
      summaryParams.push(to.trim().slice(0, 10))
    }
    if (search) {
      summaryConditions.push(`(lead_id LIKE ? OR client_name LIKE ? OR rep_name LIKE ?)`)
      const sp = `%${search}%`
      summaryParams.push(sp, sp, sp)
    }

    const summaryWhere = summaryConditions.length > 0 ? `WHERE ${summaryConditions.join(' AND ')}` : ''
    const repStatsSql = `
      SELECT rep_name, COUNT(*) as count
      FROM ssd_converted_records
      ${summaryWhere}
      GROUP BY rep_name
      ORDER BY count DESC
    `
    const repStats = db.prepare(repStatsSql).all(...summaryParams) as { rep_name: string; count: number }[]

    const repBreakdown: Record<string, number> = {}
    let topRep = '—'
    let maxCount = 0

    repStats.forEach((r) => {
      repBreakdown[r.rep_name] = r.count
      if (r.count > maxCount) {
        maxCount = r.count
        topRep = `${r.rep_name} (${r.count})`
      }
    })

    // 5. Unique Reps List for Filter
    const repsListSql = `SELECT DISTINCT rep_name, rep_username FROM ssd_converted_records ORDER BY rep_name ASC`
    const repsList = db.prepare(repsListSql).all() as { rep_name: string; rep_username: string }[]

    return NextResponse.json({
      records,
      total_count: totalRecords,
      page,
      limit,
      total_pages: limit === -1 ? 1 : Math.ceil(totalRecords / limit) || 1,
      summary: {
        total_converted: totalRecords,
        active_reps_count: repStats.length,
        top_rep: topRep,
        rep_breakdown: repBreakdown,
      },
      reps_list: repsList,
    })
  } catch (err: any) {
    console.error('[ssd-tracker/converted-cases GET error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch converted cases' }, { status: 500 })
  }
}

// DELETE /api/ssd-tracker/converted-cases
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!isAuthorizedSsdTeamLead(session)) {
      return NextResponse.json({ error: 'Forbidden: Only Team Leads and Admins can delete converted records' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const singleId = searchParams.get('id')
    const queryIds = searchParams.get('ids')

    let targetIds: number[] = []
    if (singleId) {
      targetIds = [parseInt(singleId, 10)].filter(n => !isNaN(n))
    } else if (queryIds) {
      targetIds = queryIds.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
    } else {
      try {
        const body = await req.json()
        if (Array.isArray(body?.ids)) {
          targetIds = body.ids.map((n: any) => parseInt(n, 10)).filter((n: any) => !isNaN(n))
        }
      } catch {
        // No JSON body
      }
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No IDs provided' }, { status: 400 })
    }

    const db = getDb()
    const placeholders = targetIds.map(() => '?').join(',')

    let deletedCount = 0
    const deleteConvertedTx = db.transaction(() => {
      // Find affected (date_converted, rep_name) pairs before deletion so daily_performance stays synced
      const affectedRows = db.prepare(`
        SELECT DISTINCT SUBSTR(date_converted, 1, 10) as clean_date, rep_name
        FROM ssd_converted_records
        WHERE id IN (${placeholders})
      `).all(...targetIds) as { clean_date: string; rep_name: string }[]

      const delRes = db.prepare(`DELETE FROM ssd_converted_records WHERE id IN (${placeholders})`).run(...targetIds)
      deletedCount = delRes.changes

      // Re-sync daily_performance.converted_cases for each affected date & specialist
      const countRemainingStmt = db.prepare(`
        SELECT COUNT(*) as cnt
        FROM ssd_converted_records
        WHERE SUBSTR(date_converted, 1, 10) = ? AND LOWER(TRIM(rep_name)) = LOWER(TRIM(?))
      `)
      const updateDailyPerfStmt = db.prepare(`
        UPDATE daily_performance
        SET converted_cases = ?
        WHERE date = ? AND LOWER(TRIM(agent_name)) = LOWER(TRIM(?))
      `)

      for (const pair of affectedRows) {
        if (!pair.clean_date || !pair.rep_name) continue
        const remaining = countRemainingStmt.get(pair.clean_date, pair.rep_name) as { cnt: number } | undefined
        updateDailyPerfStmt.run(remaining?.cnt || 0, pair.clean_date, pair.rep_name)
      }
    })

    deleteConvertedTx()

    if (deletedCount === 0) {
      return NextResponse.json({ error: 'Converted record(s) not found or already deleted' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} converted case record${deletedCount === 1 ? '' : 's'}.`,
    })
  } catch (err: any) {
    console.error('[ssd-tracker/converted-cases DELETE error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to delete converted cases' }, { status: 500 })
  }
}
