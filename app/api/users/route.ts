import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import bcrypt from 'bcryptjs'

// GET /api/users
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const users = db
    .prepare('SELECT id, username, display_name, role, active, created_at FROM users ORDER BY id')
    .all()

  return NextResponse.json(users)
}

// POST /api/users  — create user
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { username, password, role, display_name } = body

  if (!username || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!['master', 'regular'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const db = getDb()
  const hash = await bcrypt.hash(password, 10)

  try {
    const result = db
      .prepare(
        'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
      )
      .run(username, hash, role, display_name || username)

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }
    throw e
  }
}

// PATCH /api/users  — update user (reset password, toggle active, change role)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, password, active, role, display_name } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = getDb()

  if (password) {
    const hash = await bcrypt.hash(password, 10)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
  }
  if (active !== undefined) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
  }
  if (role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  }
  if (display_name) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, id)
  }

  return NextResponse.json({ success: true })
}
