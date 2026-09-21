import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

// GET /api/admin/audit-logs — Returns paginated upload audit trail for master/superadmin users
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || (role !== 'master' && role !== 'superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
  const limitParam = searchParams.get('limit')
  const isAll = limitParam === 'all'
  const limit = isAll ? 1000 : Math.min(Math.max(parseInt(limitParam || '10'), 1), 200)
  const offset = isAll ? 0 : (page - 1) * limit
  const uploadType = searchParams.get('upload_type')
  const search = searchParams.get('search')?.trim()

  const db = getDb()

  const conditions: string[] = []
  const params: any[] = []

  if (uploadType && uploadType !== 'ALL') {
    conditions.push('upload_type = ?')
    params.push(uploadType)
  }

  if (search) {
    conditions.push('(filename LIKE ? OR username LIKE ? OR user_name LIKE ?)')
    const pattern = `%${search}%`
    params.push(pattern, pattern, pattern)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Total count
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM upload_audit_logs ${whereClause}`).get(...params) as any
  const total = Number(countRow?.total || 0)
  const totalPages = isAll ? 1 : Math.max(Math.ceil(total / limit), 1)

  // Paginated records
  const queryParams = isAll ? [...params] : [...params, limit, offset]
  const logs = db.prepare(`
    SELECT id, username, user_name, upload_type, filename, file_size_bytes, 
           file_hash_sha256, rows_processed, status, details, ip_address, created_at
    FROM upload_audit_logs
    ${whereClause}
    ORDER BY id DESC
    ${isAll ? 'LIMIT 1000' : 'LIMIT ? OFFSET ?'}
  `).all(...queryParams)

  return NextResponse.json({
    logs,
    total,
    page: isAll ? 1 : page,
    limit: isAll ? total : limit,
    totalPages,
  })
}
