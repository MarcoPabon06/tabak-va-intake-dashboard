import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import getDb from '@/lib/db'

/**
 * POST /api/admin/reset-password
 *
 * Resets the password for the "admin" (master) user.
 *
 * Security: requests must supply the RESET_PASSWORD_TOKEN environment variable
 * value in the `Authorization: Bearer <token>` header. If the env var is not
 * set the endpoint is disabled entirely, preventing accidental exposure in
 * production.
 *
 * Body: { password: string }
 */
export async function POST(req: NextRequest) {
  // ── Guard: token must be configured ──────────────────────────────────────
  const secret = process.env.RESET_PASSWORD_TOKEN
  if (!secret) {
    return NextResponse.json(
      { error: 'Reset endpoint is disabled. Set RESET_PASSWORD_TOKEN to enable it.' },
      { status: 403 }
    )
  }

  // ── Guard: validate bearer token ─────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (token !== secret) {
    return NextResponse.json({ error: 'Invalid or missing token.' }, { status: 401 })
  }

  // ── Parse & validate body ─────────────────────────────────────────────────
  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { password } = body

  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'password is required.' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'password must be at least 8 characters.' },
      { status: 400 }
    )
  }
  if (password.length > 128) {
    return NextResponse.json(
      { error: 'password must be 128 characters or fewer.' },
      { status: 400 }
    )
  }

  // ── Hash & update ─────────────────────────────────────────────────────────
  const db = getDb()

  const admin = db
    .prepare("SELECT id FROM users WHERE username = 'admin' AND role = 'master'")
    .get() as { id: number } | undefined

  if (!admin) {
    return NextResponse.json(
      { error: "Admin user not found. Run the seed script first." },
      { status: 404 }
    )
  }

  const hash = await bcrypt.hash(password, 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, admin.id)

  return NextResponse.json({
    success: true,
    message: "Admin password updated successfully. Remove RESET_PASSWORD_TOKEN from your environment when done.",
  })
}
