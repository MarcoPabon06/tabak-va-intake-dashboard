import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendEmail, getAdminNotificationEmails } from '@/lib/email'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const recipients = getAdminNotificationEmails('VA', 'canApproveTimeOff')

    if (recipients.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid recipient email addresses configured in Manager & Admin Alert Email Recipients.'
      }, { status: 400 })
    }

    const subject = `🧪 Test Email from Tabak Law Dashboard`
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="color-scheme" content="light dark">
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 20px; color: #0f172a;">
      <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 24px;">
        <h2 style="color: #10b981; margin-top: 0;">🎉 Resend Email Integration Verified!</h2>
        <p>This is a test notification confirming your <strong>Resend API</strong> setup is working perfectly!</p>
        <div style="background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 13px; margin: 16px 0;">
          <strong>Recipients:</strong> ${recipients.join(', ')}<br>
          <strong>Timestamp:</strong> ${new Date().toLocaleString()}
        </div>
        <p style="font-size: 12px; color: #64748b;">You will now receive instant email alerts whenever Time-Off or Coaching requests are submitted.</p>
      </div>
    </body>
    </html>
    `

    const res = await sendEmail({ to: recipients, subject, html, text: 'Test Email from Tabak Law Dashboard' })

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, recipients })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
