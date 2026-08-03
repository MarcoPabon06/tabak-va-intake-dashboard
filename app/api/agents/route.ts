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

  let agents: any[]
  if (userRole === 'regular') {
    agents = db.prepare('SELECT * FROM agents WHERE lob = ? ORDER BY name').all(userLob)
  } else if (userRole === 'admin' && !allowedLobs.includes('All')) {
    const placeholders = allowedLobs.map(() => '?').join(',')
    agents = db.prepare(`SELECT * FROM agents WHERE lob IN (${placeholders}) ORDER BY name`).all(...allowedLobs)
  } else {
    agents = db.prepare('SELECT * FROM agents ORDER BY name').all()
  }

  // Fail-safe filtering for active agents (must exist as active user in users table)
  let users = db.prepare("SELECT display_name, lob FROM users WHERE role IN ('regular', 'admin') AND active = 1").all() as { display_name: string; lob?: string }[]
  if (userRole === 'admin' && !allowedLobs.includes('All')) {
    users = users.filter(u => allowedLobs.includes(u.lob || 'VA'))
  }

  const allowedAgents = users.map(u => u.display_name).filter(Boolean)
  const filteredAgents = agents
    .filter((a: any) => {
      const normalized = a.name.trim().replace(/\s+/g, '').toLowerCase()
      return allowedAgents.some(allowed => allowed.trim().replace(/\s+/g, '').toLowerCase() === normalized)
    })
    .map((a: any) => {
      const match = users.find(u => u.display_name && u.display_name.trim().replace(/\s+/g, '').toLowerCase() === a.name.trim().replace(/\s+/g, '').toLowerCase())
      return {
        ...a,
        lob: match?.lob || a.lob || 'VA',
      }
    })

  return NextResponse.json(filteredAgents)
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
