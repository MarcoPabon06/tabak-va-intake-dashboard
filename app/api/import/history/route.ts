import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userRole = (session.user as any)?.role || 'regular'
    const userLob = (session.user as any)?.lob || 'VA'
    const isSuper = userRole === 'master' || userRole === 'superadmin'
    const isAdmin = userRole === 'admin'

    if (!isSuper && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Only Team Leads and Admins can view import history' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const lob = searchParams.get('lob') || 'ALL'

    const db = getDb()

    let query = `
      SELECT 
        id,
        batch_id,
        lob,
        upload_type,
        filename,
        user_id,
        username,
        user_name,
        records_created,
        records_updated,
        status,
        created_at,
        rolled_back_at,
        rolled_back_by
      FROM import_batches
      WHERE 1=1
    `
    const params: any[] = []

    if (lob !== 'ALL' && lob !== 'All') {
      query += ` AND (lob = ? OR lob = 'ALL')`
      params.push(lob)
    }

    query += ` ORDER BY id DESC LIMIT 50`

    const batches = db.prepare(query).all(...params)

    return NextResponse.json({
      batches,
    })
  } catch (err: any) {
    console.error('[import/history GET error]:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch import history' }, { status: 500 })
  }
}
