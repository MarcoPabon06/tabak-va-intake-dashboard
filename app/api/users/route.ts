import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import bcrypt from 'bcryptjs'

// GET /api/users
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const uRole = (session?.user as any)?.role
  const uPerms = (session?.user as any)?.permissions
  if (!session || (uRole !== 'master' && uRole !== 'superadmin' && !uPerms?.canManageUsers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getDb()
  const users = db
    .prepare('SELECT id, username, email, display_name, role, active, lob, permissions, created_at FROM users ORDER BY id')
    .all()

  return NextResponse.json(users)
}

// POST /api/users  — create user
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const uRole = (session?.user as any)?.role
  const uPerms = (session?.user as any)?.permissions
  if (!session || (uRole !== 'master' && uRole !== 'superadmin' && !uPerms?.canManageUsers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { username, email, password, role, display_name, lob, permissions } = body

  if (!username || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!['master', 'superadmin', 'admin', 'qa', 'regular'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const userLob = ['SSD', 'APPS'].includes(lob) ? lob : 'VA'
  const permissionsJson = permissions ? JSON.stringify(permissions) : null
  const db = getDb()
  const hash = await bcrypt.hash(password, 10)

  try {
    const result = db
      .prepare(
        'INSERT INTO users (username, email, password_hash, role, display_name, lob, permissions) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(username, email || null, hash, role, display_name || username, userLob, permissionsJson)

    // Sync to agents table: auto-add as active agent
    const actualDisplayName = (display_name || username).trim()
    db.prepare('INSERT OR IGNORE INTO agents (name, active, lob) VALUES (?, 1, ?)').run(actualDisplayName, userLob)

    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }
    throw e
  }
}

// PATCH /api/users  — update user (reset password, toggle active, change role, update permissions, update email)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const uRole = (session?.user as any)?.role
  const uPerms = (session?.user as any)?.permissions
  if (!session || (uRole !== 'master' && uRole !== 'superadmin' && !uPerms?.canManageUsers)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { id, password, active, role, display_name, email, lob, permissions } = body

  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = getDb()

  if (password) {
    const hash = await bcrypt.hash(password, 10)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
  }

  // Get display name of the user being modified
  const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(id) as { display_name?: string } | undefined

  if (active !== undefined) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(active ? 1 : 0, id)

    // Sync to agents table if display_name exists
    if (user?.display_name) {
      const displayName = user.display_name.trim()
      if (active) {
        // Reactivate matching agent, or create if not exists
        const result = db.prepare('UPDATE agents SET active = 1 WHERE name = ?').run(displayName)
        if (result.changes === 0) {
          db.prepare('INSERT OR IGNORE INTO agents (name, active) VALUES (?, 1)').run(displayName)
        }
      } else {
        // Deactivate matching agent
        db.prepare('UPDATE agents SET active = 0 WHERE name = ?').run(displayName)
      }
    }
  }

  if (role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  }

  if (email !== undefined) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, id)
  }

  if (permissions !== undefined) {
    const permissionsJson = permissions ? JSON.stringify(permissions) : null
    db.prepare('UPDATE users SET permissions = ? WHERE id = ?').run(permissionsJson, id)
  }

  if (display_name) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name, id)
    // Sync to agents table name change
    if (user?.display_name) {
      db.prepare('UPDATE agents SET name = ? WHERE name = ?').run(display_name.trim(), user.display_name.trim())
    }
  }

  if (lob) {
    if (!['VA', 'SSD', 'APPS'].includes(lob)) {
      return NextResponse.json({ error: 'Invalid LOB value' }, { status: 400 })
    }
    db.prepare('UPDATE users SET lob = ? WHERE id = ?').run(lob, id)
    if (user?.display_name) {
      db.prepare('UPDATE agents SET lob = ? WHERE name = ?').run(lob, user.display_name.trim())
    }
  }

  return NextResponse.json({ success: true })
}
