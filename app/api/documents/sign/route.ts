import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import getDb from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user as any
    const body = await req.json()
    const { document_id, signature_text, confirmed } = body

    if (!document_id) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    if (!confirmed) {
      return NextResponse.json({ error: 'You must confirm the legal acknowledgment checkbox' }, { status: 400 })
    }

    if (!signature_text?.trim()) {
      return NextResponse.json({ error: 'Full legal name is required for electronic signature' }, { status: 400 })
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip') ||
               '127.0.0.1'
    const userAgent = req.headers.get('user-agent') || 'Browser'

    const db = getDb()

    // Find pending acknowledgement for this user
    const username = user.email || user.name
    const ack = db.prepare(`
      SELECT * FROM document_acknowledgements
      WHERE document_id = ? AND username = ? AND status = 'PENDING'
    `).get(document_id, username) as any

    if (!ack) {
      return NextResponse.json({ error: 'No pending acknowledgment found for this document and user' }, { status: 404 })
    }

    const signedAt = new Date().toISOString()

    db.prepare(`
      UPDATE document_acknowledgements
      SET status = 'SIGNED',
          signature_text = ?,
          signed_at = ?,
          ip_address = ?,
          user_agent = ?
      WHERE id = ?
    `).run(signature_text.trim(), signedAt, ip, userAgent, ack.id)

    return NextResponse.json({
      success: true,
      message: 'Document electronically signed and acknowledged successfully',
      signed_at: signedAt,
      signature_text: signature_text.trim(),
    })
  } catch (err: any) {
    console.error('[POST /api/documents/sign error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
