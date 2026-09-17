import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/settings — returns all settings as key-value object
export async function GET() {
  try {
    const db = getDb()
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const settings: Record<string, string> = {}
    for (const row of rows) {
      if (row.key === 'gemini_api_key') {
        const val = row.value || ''
        settings.has_gemini_key = val ? 'true' : 'false'
        settings.gemini_key_preview = val.length > 8 ? `${val.slice(0, 6)}...${val.slice(-4)}` : (val ? 'Configured' : '')
      } else {
        settings[row.key] = row.value
      }
    }
    // Also check if process.env.GEMINI_API_KEY is available
    if (process.env.GEMINI_API_KEY) {
      settings.has_env_gemini_key = 'true'
      if (!settings.has_gemini_key || settings.has_gemini_key === 'false') {
        settings.gemini_key_source = 'environment'
      }
    }
    return NextResponse.json(settings)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Handler for both PUT and POST /api/settings
async function handleUpdateSettings(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role
    const perms = (session?.user as any)?.permissions
    const isManager = ['master', 'superadmin', 'admin'].includes(role)
    if (!session || (!isManager && !perms?.canChangeSettings)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const db = getDb()

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)

    let entries: [string, string][] = []
    if (body.key && typeof body.value !== 'undefined') {
      // Support { key: 'gemini_api_key', value: '...' } format
      entries = [[String(body.key), String(body.value)]]
    } else {
      // Support { gemini_api_key: '...', goal_x: '...' } dictionary format
      entries = Object.entries(body).map(([k, v]) => [k, String(v)])
    }

    const update = db.transaction((items: [string, string][]) => {
      for (const [key, value] of items) {
        upsert.run(key, value)
      }
    })

    update(entries)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/settings — update settings
export async function PUT(req: Request) {
  return handleUpdateSettings(req)
}

// POST /api/settings — update settings (supports direct save from modals)
export async function POST(req: Request) {
  return handleUpdateSettings(req)
}
