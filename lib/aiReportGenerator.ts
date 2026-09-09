import getDb from '@/lib/db'

export interface ReportGenerationParams {
  from: string
  to: string
  lob: 'VA' | 'SSD' | 'APPS' | 'ALL'
  reportStyle: 'executive' | 'bottlenecks' | 'coaching' | 'monthly'
  customNotes?: string
  apiKeyOverride?: string
}

export interface MetricSummary {
  from: string
  to: string
  lob: string
  total_leads: number
  signed_retainers: number
  unsigned_retainers: number
  signed_rate: number
  converted_cases: number
  case_conv_rate: number
  rfc_sent: number
  inbound_calls: number
  crh: number
  rejected: number
  avg_capd: number
  reps: Array<{
    name: string
    signed: number
    unsigned: number
    converted: number
    signed_rate: number
    conv_rate: number
    avg_capd: number
    inbound: number
    crh: number
    rejected: number
  }>
  reasons_breakdown: Record<string, number>
  prior_period?: {
    total_leads: number
    signed_retainers: number
    converted_cases: number
    signed_rate: number
  }
}

/**
 * Resolves Gemini API key with priority:
 * 1. apiKeyOverride (user provided in modal)
 * 2. process.env.GEMINI_API_KEY
 * 3. Database settings table (gemini_api_key)
 */
export function getGeminiApiKey(apiKeyOverride?: string): string | null {
  if (apiKeyOverride && apiKeyOverride.trim()) {
    return apiKeyOverride.trim()
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return process.env.GEMINI_API_KEY.trim()
  }
  try {
    const db = getDb()
    const row = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get() as { value: string } | undefined
    if (row && row.value && row.value.trim()) {
      return row.value.trim()
    }
  } catch (err: any) {
    console.warn('[aiReportGenerator] Could not read gemini_api_key from settings:', err.message)
  }
  return null
}

/**
 * Gathers verified operational metrics from SQLite database for the selected period & LOB.
 */
export function gatherReportMetrics(params: { from: string; to: string; lob: string }): MetricSummary {
  const db = getDb()
  const { from, to, lob } = params

  let perfQuery = `
    SELECT dp.*, u.lob as user_lob
    FROM daily_performance dp
    INNER JOIN users u ON (LOWER(TRIM(dp.agent_name)) = LOWER(TRIM(u.display_name)) OR LOWER(TRIM(dp.agent_name)) = LOWER(TRIM(u.username)))
    WHERE dp.date >= ? AND dp.date <= ?
      AND u.active = 1
  `
  const perfParams: any[] = [from, to]

  if (lob !== 'ALL' && lob !== 'APPS') {
    perfQuery += ` AND u.lob = ?`
    perfParams.push(lob)
  }

  const perfRows = db.prepare(perfQuery).all(...perfParams) as any[]

  // Aggregates
  let totalSigned = 0
  let totalUnsigned = 0
  let totalConverted = 0
  let totalRfc = 0
  let totalInbound = 0
  let totalCrh = 0
  let totalRejected = 0
  let totalCapd = 0
  let capdDays = 0

  const repMap: Record<string, {
    signed: number
    unsigned: number
    converted: number
    inbound: number
    crh: number
    rejected: number
    capd_sum: number
    capd_count: number
  }> = {}

  for (const r of perfRows) {
    const s = r.signed_retainers || 0
    const u = r.unsigned_retainers || 0
    const c = r.converted_cases || 0
    const rfc = r.rfc_sent || 0
    const inb = r.inbound_calls || 0
    const crh = r.crh || 0
    const rej = r.case_rejected || 0

    totalSigned += s
    totalUnsigned += u
    totalConverted += c
    totalRfc += rfc
    totalInbound += inb
    totalCrh += crh
    totalRejected += rej

    if (r.capd && r.capd > 0) {
      totalCapd += r.capd
      capdDays++
    }

    const name = r.agent_name || 'Specialist'
    if (!repMap[name]) {
      repMap[name] = { signed: 0, unsigned: 0, converted: 0, inbound: 0, crh: 0, rejected: 0, capd_sum: 0, capd_count: 0 }
    }
    repMap[name].signed += s
    repMap[name].unsigned += u
    repMap[name].converted += c
    repMap[name].inbound += inb
    repMap[name].crh += crh
    repMap[name].rejected += rej
    if (r.capd && r.capd > 0) {
      repMap[name].capd_sum += r.capd
      repMap[name].capd_count++
    }
  }

  // If APPS or ALL, also aggregate apps_team_entries
  if (lob === 'APPS' || lob === 'ALL') {
    const appsRows = db.prepare(`
      SELECT rep_name, converted, reason_not_converted
      FROM apps_team_entries
      WHERE date_completed >= ? AND date_completed <= ?
    `).all(from, to) as any[]

    if (lob === 'APPS') {
      totalSigned = appsRows.length
      totalConverted = appsRows.filter(a => a.converted === 'YES').length
      totalUnsigned = totalSigned - totalConverted
    }

    for (const a of appsRows) {
      const rep = a.rep_name || 'Apps Specialist'
      if (!repMap[rep]) {
        repMap[rep] = { signed: 0, unsigned: 0, converted: 0, inbound: 0, crh: 0, rejected: 0, capd_sum: 0, capd_count: 0 }
      }
      if (lob === 'APPS') {
        repMap[rep].signed++
        if (a.converted === 'YES') repMap[rep].converted++
        else repMap[rep].unsigned++
      }
    }
  }

  const totalLeads = totalSigned + totalUnsigned
  const signedRate = totalLeads > 0 ? (totalSigned / totalLeads) * 100 : 0
  const caseConvRate = totalSigned > 0 ? (totalConverted / totalSigned) * 100 : 0
  const avgCapd = capdDays > 0 ? Math.round(totalCapd / capdDays) : 0

  const repsList = Object.entries(repMap).map(([name, vals]) => {
    const leads = vals.signed + vals.unsigned
    const sRate = leads > 0 ? (vals.signed / leads) * 100 : 0
    const cRate = vals.signed > 0 ? (vals.converted / vals.signed) * 100 : 0
    const repCapd = vals.capd_count > 0 ? Math.round(vals.capd_sum / vals.capd_count) : 0
    return {
      name,
      signed: vals.signed,
      unsigned: vals.unsigned,
      converted: vals.converted,
      signed_rate: Math.round(sRate * 10) / 10,
      conv_rate: Math.round(cRate * 10) / 10,
      avg_capd: repCapd,
      inbound: vals.inbound,
      crh: vals.crh,
      rejected: vals.rejected,
    }
  }).sort((a, b) => {
    if (lob === 'SSD') return b.converted - a.converted || b.signed - a.signed
    return b.signed - a.signed || b.signed_rate - a.signed_rate
  })

  // Reasons Breakdown
  const reasons: Record<string, number> = {}
  try {
    if (lob === 'VA' || lob === 'ALL') {
      const vaReasons = db.prepare(`
        SELECT outcome_reason, COUNT(*) as cnt
        FROM va_lead_records
        WHERE date >= ? AND date <= ? AND outcome_reason IS NOT NULL AND outcome_reason != ''
        GROUP BY outcome_reason
      `).all(from, to) as { outcome_reason: string; cnt: number }[]
      for (const r of vaReasons) {
        reasons[r.outcome_reason] = (reasons[r.outcome_reason] || 0) + r.cnt
      }
    }
    if (lob === 'SSD' || lob === 'ALL') {
      const ssdReasons = db.prepare(`
        SELECT outcome_reason, COUNT(*) as cnt
        FROM ssd_lead_records
        WHERE date >= ? AND date <= ? AND outcome_reason IS NOT NULL AND outcome_reason != ''
        GROUP BY outcome_reason
      `).all(from, to) as { outcome_reason: string; cnt: number }[]
      for (const r of ssdReasons) {
        reasons[r.outcome_reason] = (reasons[r.outcome_reason] || 0) + r.cnt
      }
    }
    if (lob === 'APPS' || lob === 'ALL') {
      const appsReasons = db.prepare(`
        SELECT reason_not_converted, COUNT(*) as cnt
        FROM apps_team_entries
        WHERE date_completed >= ? AND date_completed <= ? AND reason_not_converted IS NOT NULL AND reason_not_converted != ''
        GROUP BY reason_not_converted
      `).all(from, to) as { reason_not_converted: string; cnt: number }[]
      for (const r of appsReasons) {
        reasons[r.reason_not_converted] = (reasons[r.reason_not_converted] || 0) + r.cnt
      }
    }
  } catch (err: any) {
    console.warn('[aiReportGenerator] Could not gather outcome reasons:', err.message)
  }

  return {
    from,
    to,
    lob,
    total_leads: totalLeads,
    signed_retainers: totalSigned,
    unsigned_retainers: totalUnsigned,
    signed_rate: Math.round(signedRate * 10) / 10,
    converted_cases: totalConverted,
    case_conv_rate: Math.round(caseConvRate * 10) / 10,
    rfc_sent: totalRfc,
    inbound_calls: totalInbound,
    crh: totalCrh,
    rejected: totalRejected,
    avg_capd: avgCapd,
    reps: repsList,
    reasons_breakdown: reasons,
  }
}

/**
 * Builds the AI prompt based on gathered metrics and user parameters.
 */
export function buildReportPrompt(metrics: MetricSummary, params: ReportGenerationParams): { systemPrompt: string; userPrompt: string } {
  const styleDescriptions = {
    executive: 'Executive Briefing & Operations Summary: High-level executive overview focusing on overall volume, conversion efficiency, notable milestones, top performers, and strategic outlook.',
    bottlenecks: 'Bottlenecks, Risks & Lost Opportunities: Deep dive into operational friction, high client rejection/refusal reasons, lagging call pacing (CAPD), follow-up leakage, and remediation plans.',
    coaching: 'Specialist Performance & Coaching Review: Detailed evaluation of individual intake representatives, comparing volume, conversion rates, call handling times, and targeted coaching recommendations.',
    monthly: 'Comprehensive Monthly Operations Review: Full-spectrum operational analysis covering departmental KPIs, specialist rankings, pipeline conversion health, and strategic monthly goals.',
  }

  const systemPrompt = `You are a Chief Operations Officer and Senior Legal Intake Analytics Director for Tabak LLC, a premier law firm specializing in Veterans Benefits (VA) and Social Security Disability (SSD) intake and SSA filings.
Your task is to write an executive-grade, comprehensive, and highly articulate management report based ONLY on the verified database performance metrics provided.

Guiding Principles:
1. Executive Tone: Write with authority, polish, and analytical precision suitable for managing partners and directors.
2. Verified Metrics: Reference the exact numbers, percentages, and specialist names provided. Do NOT fabricate or hallucinate metrics outside the provided data.
3. Structure:
   - Header with Title, Period, Scope, and Key Metric Badges.
   - 1. Executive Summary & Core KPIs (with concise Markdown summary table).
   - 2. Division & Specialist Performance Breakdown (highlight top performers, standouts, and pacing).
   - 3. Operational Friction & Lost Opportunities Analysis (address client refusal reasons, rejections, CAPD times).
   - 4. Strategic Action Items & Management Recommendations (3-5 concrete tactical next steps).
4. Formatting: Use clean Markdown headers (###), bold key figures, bullet points, and clean Markdown tables for legibility.`

  const userPrompt = `Generate a detailed "${styleDescriptions[params.reportStyle]}" report for Tabak LLC.

REPORT PARAMETERS:
- Timeframe: ${metrics.from} to ${metrics.to}
- Scope / Division: ${metrics.lob === 'ALL' ? 'Firm-Wide Unified (VA + SSD + Apps)' : metrics.lob + ' Intake Division'}
- Report Style: ${params.reportStyle.toUpperCase()}
${params.customNotes ? `- Admin Focus Notes / Special Directives: "${params.customNotes}"` : ''}

VERIFIED DATABASE STATISTICS:
- Period: ${metrics.from} to ${metrics.to}
- Total Outbound/Inbound Leads: ${metrics.total_leads.toLocaleString()}
- Signed Retainers: ${metrics.signed_retainers.toLocaleString()}
- Unsigned Retainers: ${metrics.unsigned_retainers.toLocaleString()}
- Signed Success Rate: ${metrics.signed_rate}%
- Converted Cases: ${metrics.converted_cases.toLocaleString()}
- Case Conversion Rate (Converted / Signed): ${metrics.case_conv_rate}%
- RFC Sent: ${metrics.rfc_sent.toLocaleString()}
- Inbound Calls Handled: ${metrics.inbound_calls.toLocaleString()}
- Client Refused Help (CRH): ${metrics.crh.toLocaleString()}
- Cases Rejected: ${metrics.rejected.toLocaleString()}
- Average Call Handling Pacing (CAPD): ${metrics.avg_capd} minutes

SPECIALIST PERFORMANCE ROSTER:
${JSON.stringify(metrics.reps.slice(0, 15), null, 2)}

COMMON OUTCOME & REFUSAL REASONS:
${JSON.stringify(metrics.reasons_breakdown, null, 2)}

Write the full executive report now in Markdown format.`

  return { systemPrompt, userPrompt }
}

/**
 * Calls the Google Gemini API dynamically discovering available models for the user's API key.
 */
export async function callGeminiAPI(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string> {
  let candidateEndpoints: Array<{ version: string; model: string }> = []

  // 1. Dynamically query ModelService.ListModels to find exact models available for this API key
  try {
    for (const ver of ['v1beta', 'v1']) {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey}`)
      if (listRes.ok) {
        const listData = await listRes.json()
        const validModels = (listData.models || [])
          .filter((m: any) => {
            const name = (m.name || '').toLowerCase()
            // Only standard Gemini text generation models
            if (!name.includes('gemini')) return false
            if (
              name.includes('deep-research') ||
              name.includes('embedding') ||
              name.includes('imagen') ||
              name.includes('aqa') ||
              name.includes('tts')
            ) {
              return false
            }
            return !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent')
          })
          .map((m: any) => ({
            version: ver,
            model: (m.name || '').replace(/^models\//, ''),
          }))
          .filter((m: any) => m.model)

        if (validModels.length > 0) {
          // Sort by preference: 2.0-flash, 1.5-flash, 2.0-flash-exp, 1.5-flash-8b, 1.5-pro
          validModels.sort((a: any, b: any) => {
            const score = (name: string) => {
              const n = name.toLowerCase()
              if (n === 'gemini-2.0-flash') return 100
              if (n === 'gemini-1.5-flash') return 90
              if (n.includes('2.0-flash')) return 80
              if (n.includes('1.5-flash')) return 70
              if (n.includes('2.0-flash-exp')) return 60
              if (n.includes('1.5-flash-8b')) return 50
              if (n === 'gemini-1.5-pro') return 40
              if (n.includes('1.5-pro')) return 30
              if (n.includes('pro')) return 20
              return 10
            }
            return score(b.model) - score(a.model)
          })
          candidateEndpoints = validModels
          console.log(`[aiReportGenerator] Filtered to ${validModels.length} Gemini models on ${ver}:`, validModels.map((m: any) => m.model))
          break
        }
      }
    }
  } catch (err: any) {
    console.warn('[aiReportGenerator] Model discovery error:', err.message)
  }

  // 2. Fallback static candidate list if ListModels was empty or restricted
  if (candidateEndpoints.length === 0) {
    candidateEndpoints = [
      { version: 'v1beta', model: 'gemini-2.0-flash' },
      { version: 'v1beta', model: 'gemini-1.5-flash' },
      { version: 'v1', model: 'gemini-1.5-flash' },
      { version: 'v1beta', model: 'gemini-2.0-flash-exp' },
      { version: 'v1beta', model: 'gemini-1.5-flash-8b' },
      { version: 'v1beta', model: 'gemini-1.5-pro' },
      { version: 'v1', model: 'gemini-1.5-pro' },
    ]
  }

  let lastError = ''

  for (const { version, model } of candidateEndpoints) {
    try {
      const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`

      // Attempt with system_instruction
      let reqBody: any = {
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 3000,
        },
      }

      let res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      })

      // If 400 (system_instruction not supported in v1 or model), fallback to unified prompt
      if (!res.ok && res.status === 400) {
        reqBody = {
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 3000,
          },
        }
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        })
      }

      if (!res.ok) {
        const errorText = await res.text()
        
        // Detect prepayment depletion
        if (res.status === 429 && errorText.includes('prepayment credits are depleted')) {
          throw new Error(
            'Your Google Cloud project is configured for Prepayment billing and has a $0 balance. ' +
            'To fix this: In Google AI Studio (https://aistudio.google.com/), click "Get API key" and select "Create API key in new project" to use the 100% Free Tier (1,500 requests/day for free), or top up credits at https://ai.studio/projects.'
          )
        }

        lastError = `Model ${model} (${version}) returned ${res.status}: ${errorText}`
        console.warn(`[aiReportGenerator] ${lastError}, attempting next candidate...`)
        continue
      }

      const data = await res.json()
      const candidate = data.candidates?.[0]
      const text = candidate?.content?.parts?.[0]?.text

      if (text && text.trim()) {
        return text.trim()
      }
    } catch (err: any) {
      // Re-throw specific actionable errors
      if (err.message && err.message.includes('Prepayment billing')) {
        throw err
      }
      lastError = err.message
      console.warn(`[aiReportGenerator] Fetch error for ${model} (${version}): ${err.message}`)
    }
  }

  throw new Error(`Failed to generate report with Gemini API: ${lastError || 'No supported Gemini model could be reached'}`)
}

/**
 * Converts Markdown text into rich, inline-styled HTML suitable for pasting directly into Outlook.
 */
export function convertMarkdownToOutlookHtml(markdown: string, meta: { title: string; lob: string; dateRange: string }): string {
  // Convert simple markdown elements to HTML
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gim, '<h3 style="color: #1e3a8a; font-size: 16px; margin-top: 18px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; font-family: Calibri, sans-serif;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="color: #0f172a; font-size: 18px; margin-top: 22px; margin-bottom: 10px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; font-family: Calibri, sans-serif;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="color: #0f172a; font-size: 22px; margin-top: 24px; margin-bottom: 12px; font-family: Calibri, sans-serif;">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #0f172a;">$1</strong>')
    // Bullet points
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li style="margin-bottom: 5px; color: #334155; font-family: Calibri, sans-serif;">$1</li>')
    // Blockquotes
    .replace(/^>\s+(.*$)/gim, '<div style="background-color: #f1f5f9; border-left: 4px solid #3b82f6; padding: 8px 14px; margin: 10px 0; color: #475569; font-style: italic; font-family: Calibri, sans-serif;">$1</div>')

  // Wrap loose <li> in <ul>
  html = html.replace(/(<li[\s\S]*?<\/li>)+/g, '<ul style="padding-left: 20px; margin: 10px 0;">$&</ul>')

  // Parse markdown tables into styled HTML tables
  const tableRegex = /\|(.+)\|\n\|[-|\s]+\|\n((?:\|.+\|\n?)+)/g
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
    const headers = headerRow.split('|').map((h: string) => h.trim()).filter(Boolean)
    const rows = bodyRows.trim().split('\n').map((row: string) => row.split('|').map((c: string) => c.trim()).filter(Boolean))

    let tableHtml = '<table style="width: 100%; border-collapse: collapse; margin: 14px 0; font-family: Calibri, sans-serif; font-size: 13px;">'
    tableHtml += '<thead><tr style="background-color: #0f172a; color: #ffffff;">'
    headers.forEach((h: string) => {
      tableHtml += `<th style="padding: 8px 10px; text-align: left; border: 1px solid #cbd5e1; font-weight: 700;">${h}</th>`
    })
    tableHtml += '</tr></thead><tbody>'

    rows.forEach((cols: string[], idx: number) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc'
      tableHtml += `<tr style="background-color: ${bg};">`
      cols.forEach((col: string) => {
        tableHtml += `<td style="padding: 7px 10px; border: 1px solid #cbd5e1; color: #1e293b;">${col}</td>`
      })
      tableHtml += '</tr>'
    })
    tableHtml += '</tbody></table>'
    return tableHtml
  })

  // Format line breaks
  html = html.replace(/\n\n/g, '<p style="margin: 10px 0; line-height: 1.5; color: #1e293b; font-family: Calibri, sans-serif; font-size: 14px;"></p>')

  return `
<div style="max-width: 800px; margin: 0 auto; font-family: Calibri, Arial, sans-serif; color: #0f172a; line-height: 1.5; background-color: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
  <!-- Header Banner -->
  <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; padding: 18px 24px; border-radius: 6px; margin-bottom: 20px;">
    <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #93c5fd; font-weight: 700; margin-bottom: 4px;">
      Tabak LLC · Executive Operations Intelligence
    </div>
    <h1 style="font-size: 20px; margin: 0 0 6px 0; color: #ffffff; font-weight: 800;">${meta.title}</h1>
    <div style="font-size: 13px; color: #cbd5e1;">
      <strong>Division:</strong> ${meta.lob} &nbsp;|&nbsp; <strong>Period:</strong> ${meta.dateRange} &nbsp;|&nbsp; <strong>Generated via:</strong> Google Gemini AI
    </div>
  </div>

  <!-- Main Content -->
  <div style="font-size: 14px; color: #1e293b;">
    ${html}
  </div>

  <!-- Footer -->
  <div style="margin-top: 24px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
    Confidential · Prepared for Tabak LLC Leadership · Generated on ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
  </div>
</div>
  `
}
