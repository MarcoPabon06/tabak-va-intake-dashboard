import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'
import { sendNotification } from '@/lib/notifications'
import { sendDocumentReminderWebhookNotification } from '@/lib/webhook'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user as any
    const isManager = ['master', 'superadmin', 'admin'].includes(user.role)
    if (!isManager) {
      return NextResponse.json(
        { error: 'Forbidden: Only Administrators and Team Leads can send signature reminders' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { document_id, username } = body

    if (!document_id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    const db = getDb()
    const doc = db
      .prepare('SELECT * FROM communication_documents WHERE id = ?')
      .get(document_id) as any

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (doc.status === 'VOIDED') {
      return NextResponse.json(
        { error: 'Cannot send reminders for a voided document' },
        { status: 400 }
      )
    }

    let pendingAcks: Array<{ username: string; user_display_name: string; user_lob: string }> = []

    if (username && username !== 'ALL_PENDING') {
      pendingAcks = db
        .prepare(
          `SELECT username, user_display_name, user_lob
           FROM document_acknowledgements
           WHERE document_id = ? AND username = ? AND status = 'PENDING'`
        )
        .all(document_id, username) as any[]
    } else {
      pendingAcks = db
        .prepare(
          `SELECT username, user_display_name, user_lob
           FROM document_acknowledgements
           WHERE document_id = ? AND status = 'PENDING'`
        )
        .all(document_id) as any[]
    }

    if (pendingAcks.length === 0) {
      return NextResponse.json(
        { error: 'No pending signatures found to remind' },
        { status: 404 }
      )
    }

    const remindedByName = user.name || user.email || 'Management'

    // 1. Send in-app notification to each pending specialist
    for (const ack of pendingAcks) {
      try {
        sendNotification({
          username: ack.username,
          title: '⏰ Reminder: Pending Signature Required',
          message: `${remindedByName} sent a reminder to review and sign "${doc.title}".`,
          link: '/dashboard',
        })
      } catch {}
    }

    // 2. Send M365 Outlook Email via Power Automate Webhook
    const webhookRes = await sendDocumentReminderWebhookNotification({
      documentTitle: doc.title,
      category: doc.category || 'Operational Policy',
      remindedBy: remindedByName,
      deadlineDate: doc.deadline_date || null,
      isUrgent: doc.is_urgent === 1,
      recipientUsernames: pendingAcks.map((a) => a.username),
      recipientDisplayNames: pendingAcks.map((a) => a.user_display_name || a.username),
      targetLob: doc.target_lob || pendingAcks[0]?.user_lob || 'VA',
    })

    return NextResponse.json({
      success: true,
      reminded_count: pendingAcks.length,
      recipients: pendingAcks.map((a) => a.user_display_name || a.username),
      email_sent: webhookRes.success,
      email_error: webhookRes.error,
    })
  } catch (err: any) {
    console.error('[POST /api/documents/remind error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
