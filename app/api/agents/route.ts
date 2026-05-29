import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/agents
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const agents = db.prepare('SELECT * FROM agents ORDER BY name').all()
  return NextResponse.json(agents)
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
