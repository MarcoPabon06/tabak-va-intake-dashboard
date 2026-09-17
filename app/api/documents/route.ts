import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user as any
    const db = getDb()
    const { searchParams } = new URL(req.url)
    const docId = searchParams.get('id')

    const isManager = ['master', 'superadmin', 'admin'].includes(user.role)

    // REGULAR SPECIALIST VIEW: Only return their own assigned documents
    if (!isManager) {
      const acks = db.prepare(`
        SELECT a.id as ack_id, a.status as ack_status, a.signature_text, a.signed_at, a.ip_address,
               d.id, d.title, d.category, d.content, d.issuing_entity, d.created_by_name, d.created_by_role,
               d.created_at, d.deadline_date, d.is_urgent, d.target_type, d.target_lob
        FROM document_acknowledgements a
        JOIN communication_documents d ON a.document_id = d.id
        WHERE a.username = ? AND d.status != 'ARCHIVED'
        ORDER BY CASE WHEN a.status = 'PENDING' THEN 0 ELSE 1 END, d.created_at DESC
      `).all(user.email || user.name)

      const pending = acks.filter((a: any) => a.ack_status === 'PENDING')
      const signed = acks.filter((a: any) => a.ack_status === 'SIGNED')

      return NextResponse.json({
        isManager: false,
        pending,
        signed,
        pendingCount: pending.length,
      })
    }

    // MANAGER / ADMIN VIEW: If docId specified, return document with full recipient roster
    if (docId) {
      const doc = db.prepare(`
        SELECT d.*,
          COUNT(a.id) as total_assigned,
          SUM(CASE WHEN a.status = 'SIGNED' THEN 1 ELSE 0 END) as total_signed,
          SUM(CASE WHEN a.status = 'PENDING' THEN 1 ELSE 0 END) as total_pending
        FROM communication_documents d
        LEFT JOIN document_acknowledgements a ON d.id = a.document_id
        WHERE d.id = ?
        GROUP BY d.id
      `).get(docId)

      if (!doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }

      const roster = db.prepare(`
        SELECT * FROM document_acknowledgements
        WHERE document_id = ?
        ORDER BY CASE WHEN status = 'PENDING' THEN 0 ELSE 1 END, user_display_name ASC
      `).all(docId)

      return NextResponse.json({ doc, roster })
    }

    // MANAGER / ADMIN VIEW: Return list of all published documents with summary stats
    const documents = db.prepare(`
      SELECT d.*,
        COUNT(a.id) as total_assigned,
        SUM(CASE WHEN a.status = 'SIGNED' THEN 1 ELSE 0 END) as total_signed,
        SUM(CASE WHEN a.status = 'PENDING' THEN 1 ELSE 0 END) as total_pending
      FROM communication_documents d
      LEFT JOIN document_acknowledgements a ON d.id = a.document_id
      WHERE d.status != 'DELETED'
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `).all()

    // Also get list of active regular specialists for the recipient selector
    const activeSpecialists = db.prepare(`
      SELECT id, username, display_name, lob
      FROM users
      WHERE role = 'regular' AND active = 1
      ORDER BY display_name ASC
    `).all()

    return NextResponse.json({
      isManager: true,
      documents,
      activeSpecialists,
    })
  } catch (err: any) {
    console.error('[GET /api/documents error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user as any
    const isManager = ['master', 'superadmin', 'admin'].includes(user.role)
    if (!isManager) {
      return NextResponse.json({ error: 'Only Administrators and Team Leads can issue communications' }, { status: 403 })
    }

    const body = await req.json()
    const {
      title,
      category,
      content,
      target_type = 'ALL',
      target_lob,
      target_users,
      issuing_entity = 'Andes Workforce, LLC (for Tabak Law, LLC)',
      deadline_date,
      is_urgent = false,
      require_signature = true,
    } = body

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'Document Title and Content are required' }, { status: 400 })
    }

    const db = getDb()

    // 1. Insert communication document
    const insertDoc = db.prepare(`
      INSERT INTO communication_documents (
        title, category, content, target_type, target_lob, target_users,
        issuing_entity, created_by_id, created_by_name, created_by_username,
        created_by_role, require_signature, deadline_date, is_urgent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = insertDoc.run(
      title.trim(),
      category || 'Operational Policy',
      content.trim(),
      target_type,
      target_lob || null,
      target_users ? JSON.stringify(target_users) : null,
      issuing_entity,
      user.id ? Number(user.id) : null,
      user.name || user.email,
      user.email || user.name,
      user.role,
      require_signature ? 1 : 0,
      deadline_date || null,
      is_urgent ? 1 : 0
    )

    const documentId = Number(result.lastInsertRowid)

    // 2. Resolve matching regular specialists
    let targetSpecialists: Array<{ id: number; username: string; display_name: string; lob: string }> = []

    if (target_type === 'ALL') {
      targetSpecialists = db.prepare(`
        SELECT id, username, display_name, lob FROM users WHERE role = 'regular' AND active = 1
      `).all() as any
    } else if (target_type === 'LOB' && target_lob) {
      targetSpecialists = db.prepare(`
        SELECT id, username, display_name, lob FROM users WHERE role = 'regular' AND active = 1 AND lob = ?
      `).all(target_lob) as any
    } else if (target_type === 'INDIVIDUAL' && Array.isArray(target_users) && target_users.length > 0) {
      const placeholders = target_users.map(() => '?').join(',')
      targetSpecialists = db.prepare(`
        SELECT id, username, display_name, lob FROM users WHERE role = 'regular' AND active = 1 AND (username IN (${placeholders}) OR display_name IN (${placeholders}))
      `).all(...target_users, ...target_users) as any
    }

    // 3. Create document acknowledgements for each target specialist
    const insertAck = db.prepare(`
      INSERT INTO document_acknowledgements (
        document_id, user_id, username, user_display_name, user_lob, status
      ) VALUES (?, ?, ?, ?, ?, 'PENDING')
    `)

    const insertMany = db.transaction((specialists: any[]) => {
      for (const s of specialists) {
        insertAck.run(documentId, s.id, s.username, s.display_name || s.username, s.lob || 'VA')
        // Send in-app notification
        try {
          sendNotification({
            username: s.username,
            title: is_urgent ? '🚨 URGENT: Official Communication to Review & Sign' : '📜 Action Required: Communication to Review & Sign',
            message: `${user.name} issued "${title.trim()}". Please review and submit your electronic signature.`,
            link: '/dashboard',
          })
        } catch {}
      }
    })

    insertMany(targetSpecialists)

    return NextResponse.json({
      success: true,
      document_id: documentId,
      assigned_count: targetSpecialists.length,
    })
  } catch (err: any) {
    console.error('[POST /api/documents error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user as any
    const isManager = ['master', 'superadmin', 'admin'].includes(user.role)
    if (!isManager) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing document id' }, { status: 400 })
    }

    const db = getDb()
    db.prepare("UPDATE communication_documents SET status = 'ARCHIVED' WHERE id = ?").run(id)

    return NextResponse.json({ success: true, message: 'Document archived successfully' })
  } catch (err: any) {
    console.error('[DELETE /api/documents error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
