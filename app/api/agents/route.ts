import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/agents
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const userRole = (session.user as any)?.role || 'regular'
  const userLob = (session.user as any)?.lob || 'VA'

  const userPerms = (session.user as any)?.permissions
  const allowedLobs: string[] = userRole === 'admin'
    ? (Array.isArray(userPerms?.allowedLobs) ? userPerms.allowedLobs : [userLob])
    : ['VA', 'SSD', 'APPS']

  // Dynamically query active regular specialists from live users and agents tables
  let activeUsers = db.prepare("SELECT username, display_name, lob FROM users WHERE role = 'regular' AND active = 1").all() as { username: string; display_name: string | null; lob?: string }[]
  
  if (userRole === 'admin' && !allowedLobs.includes('All')) {
    activeUsers = activeUsers.filter(u => allowedLobs.includes(u.lob || 'VA'))
  } else if (userRole === 'regular') {
    activeUsers = activeUsers.filter(u => (u.lob || 'VA') === userLob)
  }

  const inactiveNames = new Set(
    (db.prepare("SELECT display_name, username FROM users WHERE active = 0").all() as { display_name: string | null; username: string }[])
      .flatMap(u => [u.display_name, u.username])
      .filter(Boolean)
      .map(n => (n as string).toLowerCase().trim())
  )

  let rawAgents = db.prepare('SELECT * FROM agents WHERE active = 1').all() as any[]
  if (userRole === 'admin' && !allowedLobs.includes('All')) {
    rawAgents = rawAgents.filter(a => allowedLobs.includes(a.lob || 'VA'))
  } else if (userRole === 'regular') {
    rawAgents = rawAgents.filter(a => (a.lob || 'VA') === userLob)
  }

  const combinedMap = new Map<string, { id: number | string; name: string; active: number; lob: string }>()

  // Add from users table
  for (const u of activeUsers) {
    const name = (u.display_name || u.username || '').trim()
    if (name && !inactiveNames.has(name.toLowerCase())) {
      combinedMap.set(name.toLowerCase(), {
        id: u.username,
        name,
        active: 1,
        lob: u.lob || 'VA',
      })
    }
  }

  // Add from agents table if not inactive
  for (const a of rawAgents) {
    const name = (a.name || '').trim()
    if (name && !inactiveNames.has(name.toLowerCase()) && !combinedMap.has(name.toLowerCase())) {
      combinedMap.set(name.toLowerCase(), {
        id: a.id,
        name,
        active: 1,
        lob: a.lob || 'VA',
      })
    }
  }

  const result = Array.from(combinedMap.values()).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json(result)
}

// POST /api/agents — add/update agent (master only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'master') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, active } = body

  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const db = getDb()
  db.prepare(
    `INSERT INTO agents (name, active) VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET active = excluded.active`
  ).run(name, active !== false ? 1 : 0)

  return NextResponse.json({ success: true })
}
