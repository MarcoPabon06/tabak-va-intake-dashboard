import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  let monthParam = searchParams.get('month') // e.g. YYYY-MM

  // Default to current month if not provided
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    const today = new Date()
    monthParam = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  }

  try {
    const [year, month] = monthParam.split('-').map(Number)
    const startDate = `${monthParam}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${monthParam}-${String(lastDay).padStart(2, '0')}`

    const db = getDb()

    const userRole = (session.user as any)?.role || 'regular'
    const userPerms = (session.user as any)?.permissions
    const userLob = (session.user as any)?.lob || 'VA'
    const allowedLobs: string[] = userRole === 'admin'
      ? (Array.isArray(userPerms?.allowedLobs) ? userPerms.allowedLobs : [userLob])
      : ['VA', 'SSD', 'APPS']

    // Query 1: Fetch active regular users (specialists)
    let activeSpecialists = db
      .prepare("SELECT username, display_name, lob FROM users WHERE role = 'regular' AND active = 1")
      .all() as { username: string; display_name: string; lob: string }[]

    // Query 2: Fetch approved and pending requests that overlap this month
    let overlappingRequests = db
      .prepare(`
        SELECT id, username, agent_name, lob, start_date, end_date, reason, status, manager_notes
        FROM time_off_requests
        WHERE status IN ('Approved', 'Pending')
          AND start_date <= ?
          AND end_date >= ?
        ORDER BY start_date ASC
      `)
      .all(endDate, startDate) as any[]

    if (userRole === 'admin' && !allowedLobs.includes('All')) {
      activeSpecialists = activeSpecialists.filter(s => allowedLobs.includes(s.lob || 'VA'))
      overlappingRequests = overlappingRequests.filter(r => allowedLobs.includes(r.lob || 'VA'))
    }

    return NextResponse.json({
      month: monthParam,
      activeSpecialists,
      requests: overlappingRequests,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
