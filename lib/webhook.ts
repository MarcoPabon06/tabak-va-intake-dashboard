import getDb from './db'

export interface WebhookPayload {
  event_type: 'time_off_requested' | 'time_off_updated' | 'coaching_requested' | 'test'
  title: string
  recipients: string
  agent_name: string
  lob: string
  details: string
  link: string
  cta_label: string
  html_body: string
}

/**
 * Resolves list of admin recipient email addresses based on role & permissions matrix
 */
export function getAdminNotificationEmails(lob: string, capability: string): string[] {
  const recipients = new Set<string>()
  const db = getDb()

  // 1. Add configured global admin notification emails from settings if present
  const globalEmailsRow = db.prepare("SELECT value FROM settings WHERE key = 'admin_notification_emails'").get() as { value: string } | undefined
  if (globalEmailsRow?.value) {
    globalEmailsRow.value
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'))
      .forEach(e => recipients.add(e))
  }

  // 2. Query users table for active superadmins and admins
  const users = db.prepare("SELECT username, role, permissions FROM users WHERE active = 1 AND role IN ('master', 'superadmin', 'admin')").all() as { username: string; role: string; permissions?: string | null }[]

  for (const u of users) {
    if (!u.username || !u.username.includes('@')) continue

    if (u.role === 'master' || u.role === 'superadmin') {
      recipients.add(u.username)
    } else if (u.role === 'admin' && u.permissions) {
      try {
        const perms = JSON.parse(u.permissions)
        const allowedLobs = Array.isArray(perms.allowedLobs) ? perms.allowedLobs : ['VA']
        const hasLob = allowedLobs.includes(lob) || allowedLobs.includes('All')
        
        // Check capability permission (e.g. canApproveTimeOff or canManageCoaching)
        let hasCapability = Boolean(perms[capability])
        if (capability === 'canManageCoaching' && (perms.canPerformQA || perms.canViewQA)) {
          hasCapability = true
        }

        if (hasLob && hasCapability) {
          recipients.add(u.username)
        }
      } catch {
        // Fallback
      }
    }
  }

  return Array.from(recipients)
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

      if (res.status === 401) {
        return {
          success: false,
          error: `Webhook returned 401 Unauthorized. In Power Automate, click the 'When an HTTP request is received' trigger -> Change 'Who can trigger the flow?' to 'Anyone'.`
        }
      }

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
 * Helper to build high-contrast HTML Email Template for M365 Outlook
 */
function buildHtmlEmail(params: {
  accentColor: string
  badgeText: string
  title: string
  subtitle: string
  agentName: string
  fields: { label: string; value: string; isBold?: boolean; color?: string }[]
  ctaLabel: string
  ctaUrl: string
}): string {
  const { accentColor, badgeText, title, subtitle, agentName, fields, ctaLabel, ctaUrl } = params

  const fieldsHtml = fields
    .map(
      f => `
      <div style="margin-bottom: 12px;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">${f.label}</div>
        <div style="font-size: 15px; font-weight: ${f.isBold ? '700' : '500'}; color: ${f.color || '#0f172a'};">${f.value}</div>
      </div>
    `
    )
    .join('')

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="color-scheme" content="light dark">
  </head>
  <body style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a;">
    <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden;">
      
      <!-- Header -->
      <div style="background: #0f172a; padding: 24px 28px; border-bottom: 4px solid ${accentColor};">
        <div style="display: inline-block; background: ${accentColor}; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 4px 10px; border-radius: 20px; letter-spacing: 0.05em; margin-bottom: 8px;">
          ${badgeText}
        </div>
        <h1 style="font-size: 20px; font-weight: 800; color: #ffffff; margin: 0 0 4px 0; letter-spacing: -0.01em;">${title}</h1>
        <div style="font-size: 13px; color: #94a3b8;">${subtitle}</div>
      </div>

      <!-- Content Body -->
      <div style="padding: 28px;">
        <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          ${fieldsHtml}
        </div>

        <!-- CTA Action Button -->
        <div style="text-align: center; margin-top: 28px; margin-bottom: 12px;">
          <a href="${ctaUrl}" target="_blank" style="display: inline-block; background: ${accentColor}; color: #ffffff !important; font-weight: 800; font-size: 15px; text-decoration: none; padding: 14px 28px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.15);">
            ${ctaLabel} &nbsp;&rarr;
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="background: #f8fafc; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding: 16px 28px; text-align: center;">
        Tabak Law LLC Internal Management System &middot; Automated M365 Alert
      </div>

    </div>
  </body>
  </html>
  `
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
  const ctaUrl = `${baseUrl}/time-off`
  const title = `🌴 New Time-Off Request: ${agentName} (${lobLabel})`

  // Dynamically resolve recipients with canApproveTimeOff permission
  const recipientsList = getAdminNotificationEmails(lob, 'canApproveTimeOff')
  const recipientsStr = recipientsList.join(', ')

  const htmlBody = buildHtmlEmail({
    accentColor: '#10b981',
    badgeText: `${lobLabel} · Time-Off Request`,
    title,
    subtitle: `Action required by Time-Off Approval Manager`,
    agentName,
    fields: [
      { label: 'Specialist Representative', value: agentName, isBold: true },
      { label: 'Division / LOB', value: lobLabel, isBold: true },
      { label: 'Requested Period', value: `${startDate} &nbsp;&rarr;&nbsp; ${endDate}`, isBold: true, color: '#047857' },
      { label: 'Reason / Notes', value: reason || 'None provided' },
    ],
    ctaLabel: '✅ Review & Approve Request',
    ctaUrl,
  })

  return sendPowerAutomateWebhook({
    event_type: 'time_off_requested',
    title,
    recipients: recipientsStr,
    agent_name: agentName,
    lob: lobLabel,
    details: `Specialist: ${agentName}\nLOB: ${lobLabel}\nPeriod: ${startDate} to ${endDate}\nReason: ${reason || 'N/A'}`,
    link: ctaUrl,
    cta_label: '✅ Review & Approve Request',
    html_body: htmlBody,
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
  const ctaUrl = `${baseUrl}/time-off`
  const title = `🌴 Time-Off Request ${status}: ${agentName}`
  const statusColor = status === 'Approved' ? '#10b981' : status === 'Rejected' ? '#ef4444' : '#64748b'

  const recipientsList = getAdminNotificationEmails('VA', 'canViewTimeOff')
  const recipientsStr = recipientsList.join(', ')

  const htmlBody = buildHtmlEmail({
    accentColor: statusColor,
    badgeText: `Time-Off Status Update`,
    title,
    subtitle: `Status updated to ${status}`,
    agentName,
    fields: [
      { label: 'Specialist Representative', value: agentName, isBold: true },
      { label: 'Requested Period', value: `${startDate} &nbsp;&rarr;&nbsp; ${endDate}` },
      { label: 'New Status', value: status, isBold: true, color: statusColor },
      { label: 'Reviewed By', value: reviewedBy || 'Manager' },
      { label: 'Manager Notes', value: managerNotes || 'None' },
    ],
    ctaLabel: '🌴 View Time-Off Calendar',
    ctaUrl,
  })

  return sendPowerAutomateWebhook({
    event_type: 'time_off_updated',
    title,
    recipients: recipientsStr,
    agent_name: agentName,
    lob: 'N/A',
    details: `Status: ${status}\nPeriod: ${startDate} to ${endDate}\nReviewed By: ${reviewedBy || 'Manager'}\nManager Notes: ${managerNotes || 'None'}`,
    link: ctaUrl,
    cta_label: '🌴 View Time-Off Calendar',
    html_body: htmlBody,
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
  const ctaUrl = `${baseUrl}/coaching`
  const title = `🎯 QA 1:1 Coaching Requested: ${agentName}`

  // Dynamically resolve recipients with canManageCoaching / QA permissions (e.g. Brayan & Super Admins)
  const recipientsList = getAdminNotificationEmails('VA', 'canManageCoaching')
  const recipientsStr = recipientsList.join(', ')

  const htmlBody = buildHtmlEmail({
    accentColor: '#7c3aed',
    badgeText: `QA 1:1 Coaching Session`,
    title,
    subtitle: `Specialist requested 1-on-1 coaching & feedback session`,
    agentName,
    fields: [
      { label: 'Specialist Representative', value: agentName, isBold: true },
      { label: 'Preferred Date', value: preferredDate || 'Flexible / As soon as possible', isBold: true, color: '#6d28d9' },
      { label: 'Requested Topics / Notes', value: agentNotes },
    ],
    ctaLabel: '🎯 Review & Schedule QA 1:1 Session',
    ctaUrl,
  })

  return sendPowerAutomateWebhook({
    event_type: 'coaching_requested',
    title,
    recipients: recipientsStr,
    agent_name: agentName,
    lob: 'VA Intake',
    details: `Specialist: ${agentName}\nPreferred Date: ${preferredDate || 'Flexible'}\nNotes: ${agentNotes}`,
    link: ctaUrl,
    cta_label: '🎯 Review & Schedule QA 1:1 Session',
    html_body: htmlBody,
  })
}
