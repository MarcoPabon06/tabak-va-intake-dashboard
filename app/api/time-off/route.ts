import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'

// GET /api/time-off — list requests
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const lob = searchParams.get('lob')
  const agent = searchParams.get('agent')
  const status = searchParams.get('status')

  const db = getDb()
  const userRole = (session.user as any)?.role || 'regular'
  
  // Resolve NextAuth username
  const sessionUsername = session.user?.email || ''

  if (userRole === 'regular') {
    // Regular users can only see their own requests
    const rows = db
      .prepare('SELECT * FROM time_off_requests WHERE username = ? ORDER BY start_date DESC')
      .all(sessionUsername)
    return NextResponse.json(rows)
  }

  // Master users can see all requests and filter them
  let query = 'SELECT * FROM time_off_requests WHERE 1=1'
  const params: any[] = []

  if (lob && lob !== 'All') {
    query += ' AND lob = ?'
    params.push(lob)
  }
  if (agent) {
    query += ' AND agent_name = ?'
    params.push(agent)
  }
  if (status && status !== 'All') {
    query += ' AND status = ?'
    params.push(status)
  }

  query += ' ORDER BY start_date DESC, created_at DESC'

  const rows = db.prepare(query).all(...params)
  return NextResponse.json(rows)
}

// POST /api/time-off — request time off
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { start_date, end_date, reason } = body

    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'Start date and end date are required.' }, { status: 400 })
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
      return NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format.' }, { status: 400 })
    }

    if (start_date > end_date) {
      return NextResponse.json({ error: 'Start date cannot be after end date.' }, { status: 400 })
    }

    const sessionUsername = session.user?.email || ''
    const db = getDb()

    // Look up agent name and LOB from users table to ensure security
    const userInfo = db
      .prepare('SELECT display_name, lob FROM users WHERE username = ?')
      .get(sessionUsername) as { display_name?: string; lob?: string } | undefined

    if (!userInfo) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 400 })
    }

    const agentName = userInfo.display_name || sessionUsername
    const lob = userInfo.lob || 'VA'

    // Overlap validation check
    const overlap = db
      .prepare(`
        SELECT count(*) as count 
        FROM time_off_requests 
        WHERE username = ? 
          AND status IN ('Pending', 'Approved') 
          AND (start_date <= ? AND end_date >= ?)
      `)
      .get(sessionUsername, end_date, start_date) as { count: number }

    if (overlap && overlap.count > 0) {
      return NextResponse.json({
        error: 'You already have an overlapping pending or approved request for this time period.'
      }, { status: 400 })
    }

    // Insert request
    const stmt = db.prepare(`
      INSERT INTO time_off_requests (username, agent_name, lob, start_date, end_date, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(sessionUsername, agentName, lob, start_date, end_date, reason || '')

    // SSE notification: notify all managers
    const managers = db.prepare("SELECT username FROM users WHERE role = 'master'").all() as { username: string }[]
    for (const mgr of managers) {
      sendNotification({
        username: mgr.username,
        title: 'New Time Off Request',
        message: `${agentName} (${lob}) requested time off from ${start_date} to ${end_date}.`,
        link: '/time-off'
      })
    }

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/time-off — modify existing request
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, start_date, end_date, reason } = body

    if (!id || !start_date || !end_date) {
      return NextResponse.json({ error: 'Missing request ID, start date, or end date.' }, { status: 400 })
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
      return NextResponse.json({ error: 'Dates must be in YYYY-MM-DD format.' }, { status: 400 })
    }

    if (start_date > end_date) {
      return NextResponse.json({ error: 'Start date cannot be after end date.' }, { status: 400 })
    }

    const sessionUsername = session.user?.email || ''
    const userRole = (session.user as any)?.role || 'regular'
    const db = getDb()

    const requestRecord = db
      .prepare('SELECT * FROM time_off_requests WHERE id = ?')
      .get(id) as any

    if (!requestRecord) {
      return NextResponse.json({ error: 'Time off request not found.' }, { status: 404 })
    }

    if (userRole === 'regular' && requestRecord.username !== sessionUsername) {
      return NextResponse.json({ error: 'Forbidden. You can only modify your own requests.' }, { status: 403 })
    }

    // Check overlap with other requests (excluding current request id)
    const overlap = db
      .prepare(`
        SELECT count(*) as count 
        FROM time_off_requests 
        WHERE username = ? 
          AND id != ?
          AND status IN ('Pending', 'Approved') 
          AND (start_date <= ? AND end_date >= ?)
      `)
      .get(requestRecord.username, id, end_date, start_date) as { count: number }

    if (overlap && overlap.count > 0) {
      return NextResponse.json({
        error: 'You have another overlapping pending or approved request for this time period.'
      }, { status: 400 })
    }

    const dateChanged = requestRecord.start_date !== start_date || requestRecord.end_date !== end_date
    let newStatus = requestRecord.status

    // If an approved request's dates are modified, reset status to Pending for manager re-approval
    if (requestRecord.status === 'Approved' && dateChanged) {
      newStatus = 'Pending'
    } else if (requestRecord.status === 'Cancelled' || requestRecord.status === 'Rejected') {
      newStatus = 'Pending'
    }

    db.prepare(`
      UPDATE time_off_requests 
      SET start_date = ?, 
          end_date = ?, 
          reason = ?, 
          status = ?,
          reviewed_by = ${newStatus === 'Pending' ? 'NULL' : 'reviewed_by'},
          reviewed_at = ${newStatus === 'Pending' ? 'NULL' : 'reviewed_at'},
          manager_notes = ${newStatus === 'Pending' ? 'NULL' : 'manager_notes'}
      WHERE id = ?
    `).run(start_date, end_date, reason || '', newStatus, id)

    // Send notifications to managers if modified by regular user
    if (userRole === 'regular') {
      const managers = db.prepare("SELECT username FROM users WHERE role = 'master'").all() as { username: string }[]
      for (const mgr of managers) {
        sendNotification({
          username: mgr.username,
          title: 'Time Off Request Modified',
          message: `${requestRecord.agent_name} (${requestRecord.lob}) updated their time off request (${start_date} to ${end_date}).${newStatus === 'Pending' ? ' Status reset to Pending for review.' : ''}`,
          link: '/time-off'
        })
      }
    }

    return NextResponse.json({ success: true, status: newStatus })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH /api/time-off — approve/reject request (manager only)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, status, manager_notes } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing request ID or status.' }, { status: 400 })
    }

    if (!['Approved', 'Rejected', 'Cancelled'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value.' }, { status: 400 })
    }

    const db = getDb()
    
    // Retrieve original request to send user notification
    const requestRecord = db
      .prepare('SELECT username, start_date, end_date FROM time_off_requests WHERE id = ?')
      .get(id) as { username: string; start_date: string; end_date: string } | undefined

    if (!requestRecord) {
      return NextResponse.json({ error: 'Time off request not found.' }, { status: 404 })
    }

    const sessionUsername = session.user?.name || ''
    
    db.prepare(`
      UPDATE time_off_requests 
      SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), manager_notes = ? 
      WHERE id = ?
    `).run(status, sessionUsername, manager_notes || '', id)

    // Notify requesting specialist
    sendNotification({
      username: requestRecord.username,
      title: `Time Off ${status}`,
      message: `Your time off request for ${requestRecord.start_date} to ${requestRecord.end_date} has been ${status.toLowerCase()}.`,
      link: '/time-off'
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/time-off?id=X — cancel request (mark status as Cancelled)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing request ID.' }, { status: 400 })
  }

  try {
    const db = getDb()
    const sessionUsername = session.user?.email || ''
    const userRole = (session.user as any)?.role || 'regular'

    // Find original request
    const request = db.prepare('SELECT username, agent_name, lob, start_date, end_date, status FROM time_off_requests WHERE id = ?').get(id) as { username: string; agent_name: string; lob: string; start_date: string; end_date: string; status: string } | undefined
    if (!request) {
      return NextResponse.json({ error: 'Time off request not found.' }, { status: 404 })
    }

    // Regular users can cancel their own requests (Pending, Approved, or Rejected)
    if (userRole === 'regular' && request.username !== sessionUsername) {
      return NextResponse.json({ error: 'Forbidden. You can only cancel your own requests.' }, { status: 403 })
    }

    // Update status to Cancelled so it remains in history log
    db.prepare("UPDATE time_off_requests SET status = 'Cancelled' WHERE id = ?").run(id)

    // If cancelled by regular user, notify managers
    if (userRole === 'regular') {
      const managers = db.prepare("SELECT username FROM users WHERE role = 'master'").all() as { username: string }[]
      for (const mgr of managers) {
        sendNotification({
          username: mgr.username,
          title: 'Time Off Canceled',
          message: `${request.agent_name} (${request.lob}) canceled their time off request for ${request.start_date} to ${request.end_date}.`,
          link: '/time-off'
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
