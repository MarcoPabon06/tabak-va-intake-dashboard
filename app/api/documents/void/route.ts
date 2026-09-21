import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user as any
    const isManager = ['master', 'superadmin', 'admin'].includes(user.role)
    if (!isManager) {
      return NextResponse.json({ error: 'Forbidden: Only Administrators and Team Leads can void communications' }, { status: 403 })
    }

    const body = await req.json()
    const { document_id, void_reason } = body

    if (!document_id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    if (!void_reason?.trim()) {
      return NextResponse.json({ error: 'A valid reason is required to officially void this document' }, { status: 400 })
    }

    const db = getDb()

    // 1. Fetch document to ensure it exists and is not already voided
    const doc = db.prepare('SELECT * FROM communication_documents WHERE id = ?').get(document_id) as any
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (doc.status === 'VOIDED') {
      return NextResponse.json({ error: 'Document is already voided' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const voidedByName = user.name || user.username || 'Management'

    // 2. Transactionally update document and pending acknowledgements
    const voidTransaction = db.transaction(() => {
      // Mark document as VOIDED with reason and audit metadata
      db.prepare(`
        UPDATE communication_documents
        SET status = 'VOIDED',
            void_reason = ?,
            voided_at = ?,
            voided_by_username = ?,
            voided_by_name = ?,
            updated_at = ?
        WHERE id = ?
      `).run(void_reason.trim(), now, user.username, voidedByName, now, document_id)

      // Mark all PENDING acknowledgements as VOIDED so they can no longer be signed
      db.prepare(`
        UPDATE document_acknowledgements
        SET status = 'VOIDED'
        WHERE document_id = ? AND status = 'PENDING'
      `).run(document_id)
    })

    voidTransaction()

    // 3. Dispatch real-time in-app notifications to all assigned specialists
    try {
      const recipients = db.prepare(`
        SELECT DISTINCT username, user_display_name
        FROM document_acknowledgements
        WHERE document_id = ?
      `).all(document_id) as { username: string; user_display_name: string }[]

      for (const r of recipients) {
        sendNotification({
          username: r.username,
          title: '🚫 Communication Voided',
          message: `"${doc.title}" has been officially voided by ${voidedByName}: "${void_reason.trim()}". No signature is required.`,
          link: '/dashboard',
        })
      }
    } catch (notifErr) {
      console.warn('[void route] Failed to dispatch notifications:', notifErr)
    }

    return NextResponse.json({
      success: true,
      message: 'Document successfully voided and removed from active signature queues',
      voided_at: now,
      voided_by: voidedByName,
      void_reason: void_reason.trim(),
    })
  } catch (err: any) {
    console.error('[POST /api/documents/void error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
