import getDb from './db'

interface SendEmailParams {
  to: string[]
  subject: string
  html: string
  text?: string
}

/**
 * Core Resend Email Sender Utility
 * Uses native fetch to send HTTP requests to https://api.resend.com/emails
 */
export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getDb()

    // 1. Get Resend API Key from DB settings or process.env
    const apiKeyRow = db.prepare("SELECT value FROM settings WHERE key = 'resend_api_key'").get() as { value: string } | undefined
    const apiKey = apiKeyRow?.value || process.env.RESEND_API_KEY

    if (!apiKey || !apiKey.trim()) {
      console.warn('[email] Resend API Key is not configured. Email notification skipped.')
      return { success: false, error: 'Resend API Key is not configured.' }
    }

    // 2. Get Sender Email / From Name
    const fromRow = db.prepare("SELECT value FROM settings WHERE key = 'resend_from_email'").get() as { value: string } | undefined
    const fromEmail = fromRow?.value || process.env.RESEND_FROM_EMAIL || 'Tabak LLC Dashboard <onboarding@resend.dev>'

    // 3. Filter valid email addresses
    const validRecipients = params.to
      .map(e => e.trim())
      .filter(e => e.includes('@') && e.includes('.'))

    if (validRecipients.length === 0) {
      console.warn('[email] No valid recipient email addresses specified.')
      return { success: false, error: 'No valid recipient email addresses.' }
    }

    // 4. Send request to Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: validRecipients,
        subject: params.subject,
        html: params.html,
        text: params.text || '',
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[email] Resend API Error:', data)
      return { success: false, error: data.message || 'Failed to send email via Resend' }
    }

    console.log(`[email] Email sent successfully to ${validRecipients.join(', ')} (ID: ${data.id})`)
    return { success: true }
  } catch (err: any) {
    console.error('[email] Exception sending email:', err.message)
    return { success: false, error: err.message }
  }
}

/**
 * Resolves list of admin recipient email addresses for a specific LOB and capability
 */
export function getAdminNotificationEmails(lob: string, capability: string): string[] {
  const recipients = new Set<string>()
  const db = getDb()

  // 1. Add configured global admin notification emails from settings
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
        const hasCapability = Boolean(perms[capability])

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
 * Gets base URL of application for dashboard links
 */
function getAppBaseUrl(): string {
  const db = getDb()
  const row = db.prepare("SELECT value FROM settings WHERE key = 'app_base_url'").get() as { value: string } | undefined
  return row?.value || process.env.NEXTAUTH_URL || 'https://tabak-dashboard.up.railway.app'
}

/**
 * Send Time-Off Submission Notification Email to Admins
 */
export async function sendTimeOffNotificationEmail(params: {
  agentName: string
  lob: string
  startDate: string
  endDate: string
  reason?: string
}) {
  const { agentName, lob, startDate, endDate, reason } = params
  const recipients = getAdminNotificationEmails(lob, 'canApproveTimeOff')

  if (recipients.length === 0) {
    console.warn('[email] No admin email recipients found for Time-Off notification.')
    return
  }

  const baseUrl = getAppBaseUrl()
  const lobLabel = lob === 'VA' ? 'VA Intake' : lob === 'SSD' ? 'SSD Intake' : 'Apps Team'

  const subject = `🌴 New Time-Off Request: ${agentName} (${lobLabel})`

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="color-scheme" content="light dark">
    <style>
      body { font-family: Arial, Helvetica, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #0f172a; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 24px; }
      .header { border-bottom: 3px solid #10b981; padding-bottom: 12px; margin-bottom: 20px; }
      .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
      .sub { font-size: 13px; color: #475569; }
      .card { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
      .field-group { margin-bottom: 10px; }
      .field-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
      .field-value { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
      .btn { display: inline-block; background: #10b981; color: #ffffff !important; font-weight: 800; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin-top: 10px; }
      .footer { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2 class="title">🌴 New Time-Off Request Submitted</h2>
        <div class="sub">Division: <strong>${lobLabel}</strong> · Action Required</div>
      </div>

      <div class="card">
        <div class="field-group">
          <div class="field-label">Specialist Representative</div>
          <div class="field-value">${agentName}</div>
        </div>
        <div class="field-group">
          <div class="field-label">Requested Period</div>
          <div class="field-value">${startDate} &nbsp;→&nbsp; ${endDate}</div>
        </div>
        ${reason ? `
        <div class="field-group" style="margin-bottom: 0;">
          <div class="field-label">Reason / Notes</div>
          <div class="field-value" style="font-weight: 500; font-size: 14px; color: #334155;">${reason}</div>
        </div>
        ` : ''}
      </div>

      <div style="text-align: center;">
        <a href="${baseUrl}/time-off" class="btn" target="_blank">✅ Review & Approve Request</a>
      </div>

      <div class="footer">
        Tabak LLC Internal Management System · Confidential Notification
      </div>
    </div>
  </body>
  </html>
  `

  const text = `🌴 NEW TIME-OFF REQUEST\nSpecialist: ${agentName}\nLOB: ${lobLabel}\nPeriod: ${startDate} to ${endDate}\nReason: ${reason || 'N/A'}\n\nReview at: ${baseUrl}/time-off`

  await sendEmail({ to: recipients, subject, html, text })
}

/**
 * Send Time-Off Status Update Email to Specialist
 */
export async function sendTimeOffStatusUpdateEmail(params: {
  toEmail: string
  agentName: string
  startDate: string
  endDate: string
  status: 'Approved' | 'Rejected' | 'Cancelled'
  reviewedBy?: string
  managerNotes?: string
}) {
  const { toEmail, agentName, startDate, endDate, status, reviewedBy, managerNotes } = params
  if (!toEmail || !toEmail.includes('@')) return

  const baseUrl = getAppBaseUrl()
  const isApproved = status === 'Approved'
  const isRejected = status === 'Rejected'

  const subject = `🌴 Time-Off Request ${status}: ${startDate} – ${endDate}`
  const statusColor = isApproved ? '#10b981' : isRejected ? '#ef4444' : '#64748b'

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="color-scheme" content="light dark">
    <style>
      body { font-family: Arial, Helvetica, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #0f172a; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 24px; }
      .header { border-bottom: 3px solid ${statusColor}; padding-bottom: 12px; margin-bottom: 20px; }
      .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
      .card { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
      .field-group { margin-bottom: 10px; }
      .field-label { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; }
      .field-value { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
      .footer { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2 class="title" style="color: ${statusColor};">🌴 Time-Off Request ${status}</h2>
        <div style="font-size: 13px; color: #475569;">Hello ${agentName}, your requested time off status has been updated.</div>
      </div>

      <div class="card">
        <div class="field-group">
          <div class="field-label">Period</div>
          <div class="field-value">${startDate} &nbsp;→&nbsp; ${endDate}</div>
        </div>
        <div class="field-group">
          <div class="field-label">Status</div>
          <div class="field-value" style="color: ${statusColor};">${status}</div>
        </div>
        ${reviewedBy ? `
        <div class="field-group">
          <div class="field-label">Reviewed By</div>
          <div class="field-value">${reviewedBy}</div>
        </div>
        ` : ''}
        ${managerNotes ? `
        <div class="field-group" style="margin-bottom: 0;">
          <div class="field-label">Manager Notes</div>
          <div class="field-value" style="font-weight: 500; font-size: 14px; color: #334155;">${managerNotes}</div>
        </div>
        ` : ''}
      </div>

      <div class="footer">
        Tabak LLC Internal Management System · Confidential Notification
      </div>
    </div>
  </body>
  </html>
  `

  const text = `🌴 TIME-OFF REQUEST ${status.toUpperCase()}\nHello ${agentName}, your time-off request for ${startDate} to ${endDate} has been marked as ${status}.${managerNotes ? ' Notes: ' + managerNotes : ''}`

  await sendEmail({ to: [toEmail], subject, html, text })
}

/**
 * Send Coaching Request Notification Email to Admins
 */
export async function sendCoachingNotificationEmail(params: {
  agentName: string
  preferredDate?: string
  agentNotes: string
  linkedCallId?: string
}) {
  const { agentName, preferredDate, agentNotes, linkedCallId } = params
  const recipients = getAdminNotificationEmails('VA', 'canManageCoaching')

  if (recipients.length === 0) {
    console.warn('[email] No admin email recipients found for Coaching notification.')
    return
  }

  const baseUrl = getAppBaseUrl()
  const subject = `🎯 Coaching Session Requested: ${agentName}`

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta name="color-scheme" content="light dark">
    <style>
      body { font-family: Arial, Helvetica, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #0f172a; }
      .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #cbd5e1; padding: 24px; }
      .header { border-bottom: 3px solid #7c3aed; padding-bottom: 12px; margin-bottom: 20px; }
      .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; }
      .card { background: #fdf4ff; border: 1px solid #f5d0fe; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
      .field-group { margin-bottom: 10px; }
      .field-label { font-size: 11px; font-weight: 700; color: #6b21a8; text-transform: uppercase; }
      .field-value { font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px; }
      .btn { display: inline-block; background: #7c3aed; color: #ffffff !important; font-weight: 800; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin-top: 10px; }
      .footer { font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px; text-align: center; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2 class="title">🎯 Coaching & Feedback Session Requested</h2>
        <div style="font-size: 13px; color: #475569;">Specialist requested 1-on-1 coaching assistance</div>
      </div>

      <div class="card">
        <div class="field-group">
          <div class="field-label">Specialist Representative</div>
          <div class="field-value">${agentName}</div>
        </div>
        ${preferredDate ? `
        <div class="field-group">
          <div class="field-label">Preferred Date</div>
          <div class="field-value">${preferredDate}</div>
        </div>
        ` : ''}
        ${linkedCallId ? `
        <div class="field-group">
          <div class="field-label">Linked Call Evaluation ID</div>
          <div class="field-value">${linkedCallId}</div>
        </div>
        ` : ''}
        <div class="field-group" style="margin-bottom: 0;">
          <div class="field-label">Specialist Notes / Requested Topics</div>
          <div class="field-value" style="font-weight: 500; font-size: 14px; color: #334155;">${agentNotes}</div>
        </div>
      </div>

      <div style="text-align: center;">
        <a href="${baseUrl}/coaching" class="btn" target="_blank">🎯 View & Schedule Coaching</a>
      </div>

      <div class="footer">
        Tabak LLC Internal Management System · Confidential Notification
      </div>
    </div>
  </body>
  </html>
  `

  const text = `🎯 COACHING SESSION REQUESTED\nSpecialist: ${agentName}\nPreferred Date: ${preferredDate || 'N/A'}\nNotes: ${agentNotes}\n\nSchedule at: ${baseUrl}/coaching`

  await sendEmail({ to: recipients, subject, html, text })
}
