import { NextResponse } from 'next/server'
import getDb from '@/lib/db'

// GET /api/settings — returns all settings as key-value object
export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key] = row.value
    return NextResponse.json(settings)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/settings — update settings (master only)
// Body: { "goal_signed_retainers": "35", "goal_conversion_rate": "65", ... }
export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const db = getDb()

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)

    const update = db.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        upsert.run(key, String(value))
      }
    })

    update(Object.entries(body))

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
