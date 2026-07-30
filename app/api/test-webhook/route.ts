import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendPowerAutomateWebhook } from '@/lib/webhook'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userName = session.user?.name || session.user?.email || 'Admin User'

    const res = await sendPowerAutomateWebhook({
      event_type: 'test',
      title: '🧪 Test Notification: M365 Power Automate Webhook Verified',
      agent_name: userName,
      lob: 'Tabak Dashboard',
      details: `This is a test webhook payload sent from your Tabak Law Dashboard at ${new Date().toLocaleString()}.`,
      link: 'https://tabak-dashboard.up.railway.app',
    })

    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
