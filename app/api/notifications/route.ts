import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/notifications
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const username = session.user.email
    const db = getDb()
    
    const notifications = db
      .prepare('SELECT * FROM notifications WHERE username = ? ORDER BY created_at DESC LIMIT 50')
      .all(username)

    return NextResponse.json(notifications)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/notifications (mark as read)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const username = session.user.email
    const body = await req.json().catch(() => ({}))
    const { id } = body

    const db = getDb()

    if (id) {
      db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND username = ?').run(id, username)
    } else {
      db.prepare('UPDATE notifications SET read = 1 WHERE username = ?').run(username)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
