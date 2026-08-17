import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/admin/audit-logs — Returns recent upload audit trail for master/superadmin users
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || (role !== 'master' && role !== 'superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

  const db = getDb()
  const logs = db.prepare(`
    SELECT id, username, user_name, upload_type, filename, file_size_bytes, 
           file_hash_sha256, rows_processed, status, details, ip_address, created_at
    FROM upload_audit_logs
    ORDER BY id DESC
    LIMIT ?
  `).all(limit)

  return NextResponse.json({ logs })
}
