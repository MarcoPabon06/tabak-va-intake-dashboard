import getDb from './db'

export interface WebhookPayload {
  event_type: 'time_off_requested' | 'time_off_updated' | 'coaching_requested' | 'test'
  title: string
  agent_name: string
  lob: string
  details: string
  link: string
}

/**
 * Sends a JSON payload to the configured Microsoft Power Automate Webhook URL
 */
export async function sendPowerAutomateWebhook(payload: WebhookPayload): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'power_automate_webhook_url'").get() as { value: string } | undefined
    const webhookUrl = row?.value || process.env.POWER_AUTOMATE_WEBHOOK_URL

    if (!webhookUrl || !webhookUrl.trim()) {
      console.warn('[webhook] Power Automate Webhook URL is not configured. Webhook skipped.')
      return { success: false, error: 'Power Automate Webhook URL is not configured in Settings.' }
    }

    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[webhook] Power Automate Webhook Error:', res.status, text)
      return { success: false, error: `Webhook returned status ${res.status}: ${text || res.statusText}` }
    }

    console.log('[webhook] Power Automate Webhook executed successfully:', payload.title)
    return { success: true }
  } catch (err: any) {
    console.error('[webhook] Exception triggering Power Automate Webhook:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Gets base URL of application for dashboard links
 */
function getAppBaseUrl(): string {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'app_base_url'").get() as { value: string } | undefined
  return row?.value || process.env.NEXTAUTH_URL || 'https://tabak-dashboard.up.railway.app'
}

/**
 * Send Webhook for Time-Off Request Submission
 */
export async function sendTimeOffWebhookNotification(params: {
  agentName: string
  lob: string
  startDate: string
  endDate: string
  reason?: string
}) {
  const { agentName, lob, startDate, endDate, reason } = params
  const baseUrl = getAppBaseUrl()
  const lobLabel = lob === 'VA' ? 'VA Intake' : lob === 'SSD' ? 'SSD Intake' : 'Apps Team'

  return sendPowerAutomateWebhook({
    event_type: 'time_off_requested',
    title: `🌴 New Time-Off Request: ${agentName} (${lobLabel})`,
    agent_name: agentName,
    lob: lobLabel,
    details: `Period: ${startDate} to ${endDate}\nReason/Notes: ${reason || 'N/A'}`,
    link: `${baseUrl}/time-off`,
  })
}

/**
 * Send Webhook for Time-Off Request Status Update
 */
export async function sendTimeOffStatusWebhookNotification(params: {
  agentName: string
  startDate: string
  endDate: string
  status: string
  reviewedBy?: string
  managerNotes?: string
}) {
  const { agentName, startDate, endDate, status, reviewedBy, managerNotes } = params
  const baseUrl = getAppBaseUrl()

  return sendPowerAutomateWebhook({
    event_type: 'time_off_updated',
    title: `🌴 Time-Off Request ${status}: ${agentName}`,
    agent_name: agentName,
    lob: 'N/A',
    details: `Status: ${status}\nPeriod: ${startDate} to ${endDate}\nReviewed By: ${reviewedBy || 'Manager'}\nManager Notes: ${managerNotes || 'None'}`,
    link: `${baseUrl}/time-off`,
  })
}

/**
 * Send Webhook for Coaching Request Submission
 */
export async function sendCoachingWebhookNotification(params: {
  agentName: string
  preferredDate?: string
  agentNotes: string
}) {
  const { agentName, preferredDate, agentNotes } = params
  const baseUrl = getAppBaseUrl()

  return sendPowerAutomateWebhook({
    event_type: 'coaching_requested',
    title: `🎯 Coaching Session Requested: ${agentName}`,
    agent_name: agentName,
    lob: 'VA Intake',
    details: `Preferred Date: ${preferredDate || 'Flexible'}\nRequested Topics / Notes: ${agentNotes}`,
    link: `${baseUrl}/coaching`,
  })
}
