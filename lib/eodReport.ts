import { format } from 'date-fns'

interface PerformanceRow {
  date: string
  agent_name: string
  capd: number
  inbound_calls: number
  case_rejected: number
  crh: number
  signed_retainers: number
  unsigned_retainers: number
  converted_cases?: number
  rfc_sent?: number
  total_case_wanted: number
  signed_success_rate: number
  present: string
}

interface AppsRow {
  id: number
  lead_id: string
  client_name: string
  date_completed: string
  converted: 'YES' | 'NO'
  reason_not_converted?: string
  other_reason?: string
  rep_name: string
}

export function generateEODReportHtml(params: {
  lob: string
  from: string
  to: string
  perfData: PerformanceRow[]
  appsData: AppsRow[]
}): { html: string; text: string } {
  const { lob, from, to, perfData, appsData } = params

  const formattedFrom = from ? format(new Date(from + 'T00:00:00'), 'MMM d, yyyy') : 'Today'
  const formattedTo = to ? format(new Date(to + 'T00:00:00'), 'MMM d, yyyy') : 'Today'
  const dateRangeStr = from === to ? formattedFrom : `${formattedFrom} – ${formattedTo}`

  let lobLabel = 'All Divisions'
  if (lob === 'VA') lobLabel = 'Veterans Benefits Division (VA Intake)'
  if (lob === 'SSD') lobLabel = 'Social Security Disability Division (SSD Intake)'
  if (lob === 'APPS') lobLabel = 'Applications Team (SSA Filings)'

  // ── APPS TEAM REPORT ──
  if (lob === 'APPS') {
    const totalApps = appsData.length
    const convertedApps = appsData.filter(e => e.converted === 'YES').length
    const pendingApps = appsData.filter(e => e.converted === 'NO').length
    const rate = totalApps > 0 ? ((convertedApps / totalApps) * 100).toFixed(1) : '0.0'

    // Group by Rep
    const repStats: Record<string, { total: number; converted: number; pending: number }> = {}
    appsData.forEach(e => {
      const rep = e.rep_name || 'Apps Rep'
      if (!repStats[rep]) repStats[rep] = { total: 0, converted: 0, pending: 0 }
      repStats[rep].total++
      if (e.converted === 'YES') repStats[rep].converted++
      else repStats[rep].pending++
    })

    const repRows = Object.entries(repStats)
      .map(([rep, s]) => ({
        rep,
        total: s.total,
        converted: s.converted,
        pending: s.pending,
        rate: s.total > 0 ? ((s.converted / s.total) * 100).toFixed(1) : '0.0'
      }))
      .sort((a, b) => b.converted - a.converted)

    const mvp = repRows[0]

    const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; color: #1e293b; line-height: 1.5; background: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
      <!-- Header -->
      <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #0f172a; margin: 0 0 4px 0; font-size: 20px;">📲 End of Day (EOD) Performance Report</h2>
        <div style="color: #475569; font-size: 13px;">
          <strong>Division:</strong> ${lobLabel} &nbsp;|&nbsp; <strong>Period:</strong> ${dateRangeStr}
        </div>
      </div>

      <!-- Executive Summary Cards -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: #64748b; font-weight: bold; text-transform: uppercase;">Total Apps</div>
            <div style="font-size: 22px; font-weight: bold; color: #0f172a; margin-top: 4px;">${totalApps}</div>
          </td>
          <td style="width: 25%; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: #166534; font-weight: bold; text-transform: uppercase;">Converted (YES)</div>
            <div style="font-size: 22px; font-weight: bold; color: #15803d; margin-top: 4px;">${convertedApps}</div>
          </td>
          <td style="width: 25%; padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: #92400e; font-weight: bold; text-transform: uppercase;">Pending (NO)</div>
            <div style="font-size: 22px; font-weight: bold; color: #b45309; margin-top: 4px;">${pendingApps}</div>
          </td>
          <td style="width: 25%; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center;">
            <div style="font-size: 11px; color: #1e40af; font-weight: bold; text-transform: uppercase;">Conv. Rate</div>
            <div style="font-size: 22px; font-weight: bold; color: #1d4ed8; margin-top: 4px;">${rate}%</div>
          </td>
        </tr>
      </table>

      ${mvp ? `
      <!-- MVP Highlight -->
      <div style="background: #fdf4ff; border: 1px solid #f5d0fe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
        <span style="font-size: 14px; font-weight: bold; color: #86198f;">🏆 Top Performer: ${mvp.rep}</span>
        <span style="font-size: 13px; color: #701a75; margin-left: 12px;">${mvp.converted} Converted Cases (${mvp.rate}% Conversion)</span>
      </div>
      ` : ''}

      <!-- Detailed Breakdown Table -->
      <h3 style="font-size: 15px; color: #0f172a; margin: 0 0 10px 0;">Representative Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
        <thead>
          <tr style="background: #0f172a; color: #ffffff; text-align: left;">
            <th style="padding: 8px 12px; border: 1px solid #0f172a;">Representative</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Apps Filed</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Converted</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Pending</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Conv. Rate</th>
          </tr>
        </thead>
        <tbody>
          ${repRows.map((r, i) => `
            <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${r.rep}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${r.total}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #15803d; font-weight: bold;">${r.converted}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #b45309;">${r.pending}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${r.rate}%</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Footer -->
      <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px;">
        Report generated from Tabak LLC Dashboard · Confidential Internal Report
      </div>
    </div>
    `

    const text = `📊 EOD REPORT - ${lobLabel}\nPeriod: ${dateRangeStr}\n\nSummary:\n- Total Apps Filed: ${totalApps}\n- Converted (YES): ${convertedApps}\n- Pending (NO): ${pendingApps}\n- Conversion Rate: ${rate}%\n\nRepresentative Breakdown:\n` +
      repRows.map(r => `• ${r.rep}: ${r.total} Filed | ${r.converted} Converted | ${r.pending} Pending | ${r.rate}% Rate`).join('\n')

    return { html, text }
  }

  // ── INTAKE (VA / SSD / ALL) REPORT ──
  const isSSD = lob === 'SSD'

  const agentStats: Record<string, {
    signed: number
    unsigned: number
    converted: number
    rfc: number
    capd_total: number
    days: number
  }> = {}

  perfData.forEach(r => {
    if (!agentStats[r.agent_name]) {
      agentStats[r.agent_name] = { signed: 0, unsigned: 0, converted: 0, rfc: 0, capd_total: 0, days: 0 }
    }
    const a = agentStats[r.agent_name]
    a.signed += r.signed_retainers || 0
    a.unsigned += r.unsigned_retainers || 0
    a.converted += r.converted_cases || 0
    a.rfc += r.rfc_sent || 0
    a.capd_total += r.capd || 0
    a.days++
  })

  const totalSigned = perfData.reduce((s, r) => s + (r.signed_retainers || 0), 0)
  const totalUnsigned = perfData.reduce((s, r) => s + (r.unsigned_retainers || 0), 0)
  const totalConverted = perfData.reduce((s, r) => s + (r.converted_cases || 0), 0)
  const totalRfc = perfData.reduce((s, r) => s + (r.rfc_sent || 0), 0)
  const totalCases = totalSigned + totalUnsigned

  const teamConvRate = isSSD
    ? (totalSigned > 0 ? ((totalConverted / totalSigned) * 100).toFixed(1) : '0.0')
    : (totalCases > 0 ? ((totalSigned / totalCases) * 100).toFixed(1) : '0.0')

  const totalDays = new Set(perfData.map(r => r.date)).size
  const avgCapd = totalDays > 0 ? Math.round(perfData.reduce((s, r) => s + (r.capd || 0), 0) / totalDays) : 0

  const agentRows = Object.entries(agentStats)
    .map(([agent, s]) => {
      let rate = '0.0'
      let signedRate = '0.0'
      if (isSSD) {
        rate = s.signed > 0 ? ((s.converted / s.signed) * 100).toFixed(1) : '0.0'
        const total = s.signed + s.unsigned
        signedRate = total > 0 ? ((s.signed / total) * 100).toFixed(1) : '0.0'
      } else {
        const total = s.signed + s.unsigned
        rate = total > 0 ? ((s.signed / total) * 100).toFixed(1) : '0.0'
      }
      const capdAvg = s.days > 0 ? Math.round(s.capd_total / s.days) : 0
      return { agent, signed: s.signed, unsigned: s.unsigned, converted: s.converted, rfc: s.rfc, rate, signedRate, capdAvg }
    })
    .sort((a, b) => isSSD ? b.converted - a.converted : b.signed - a.signed)

  const mvp = agentRows[0]
  const teamSignedRate = totalCases > 0 ? ((totalSigned / totalCases) * 100).toFixed(1) : '0.0'

  const html = `
  <div style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; color: #1e293b; line-height: 1.5; background: #ffffff; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0;">
    <!-- Header -->
    <div style="border-bottom: 2px solid ${isSSD ? '#ec4899' : '#b82105'}; padding-bottom: 12px; margin-bottom: 16px;">
      <h2 style="color: #0f172a; margin: 0 0 4px 0; font-size: 20px;">📊 End of Day (EOD) Performance Report</h2>
      <div style="color: #475569; font-size: 13px;">
        <strong>Division:</strong> ${lobLabel} &nbsp;|&nbsp; <strong>Period:</strong> ${dateRangeStr}
      </div>
    </div>

    <!-- Executive Summary Cards -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr>
        ${isSSD ? `
        <td style="width: 20%; padding: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; text-align: center;">
          <div style="font-size: 10px; color: #166534; font-weight: bold; text-transform: uppercase;">Converted Cases</div>
          <div style="font-size: 20px; font-weight: bold; color: #15803d; margin-top: 4px;">${totalConverted}</div>
        </td>
        <td style="width: 20%; padding: 10px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center;">
          <div style="font-size: 10px; color: #1e40af; font-weight: bold; text-transform: uppercase;">Signed Retainers</div>
          <div style="font-size: 20px; font-weight: bold; color: #1d4ed8; margin-top: 4px;">${totalSigned}</div>
        </td>
        <td style="width: 20%; padding: 10px; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px; text-align: center;">
          <div style="font-size: 10px; color: #6b21a8; font-weight: bold; text-transform: uppercase;">Signed Rate</div>
          <div style="font-size: 20px; font-weight: bold; color: #7e22ce; margin-top: 4px;">${teamSignedRate}%</div>
        </td>
        <td style="width: 20%; padding: 10px; background: #fdf2f8; border: 1px solid #fbcfe8; border-radius: 6px; text-align: center;">
          <div style="font-size: 10px; color: #9d174d; font-weight: bold; text-transform: uppercase;">Case Conv. Rate</div>
          <div style="font-size: 20px; font-weight: bold; color: #be185d; margin-top: 4px;">${teamConvRate}%</div>
        </td>
        <td style="width: 20%; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center;">
          <div style="font-size: 10px; color: #475569; font-weight: bold; text-transform: uppercase;">RFC Sent</div>
          <div style="font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 4px;">${totalRfc}</div>
        </td>
        ` : `
        <td style="width: 25%; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #166534; font-weight: bold; text-transform: uppercase;">Signed Retainers</div>
          <div style="font-size: 22px; font-weight: bold; color: #15803d; margin-top: 4px;">${totalSigned}</div>
        </td>
        <td style="width: 25%; padding: 12px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #92400e; font-weight: bold; text-transform: uppercase;">Unsigned</div>
          <div style="font-size: 22px; font-weight: bold; color: #b45309; margin-top: 4px;">${totalUnsigned}</div>
        </td>
        <td style="width: 25%; padding: 12px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #1e40af; font-weight: bold; text-transform: uppercase;">Conv. Rate</div>
          <div style="font-size: 22px; font-weight: bold; color: #1d4ed8; margin-top: 4px;">${teamConvRate}%</div>
        </td>
        <td style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; text-align: center;">
          <div style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Avg CAPD</div>
          <div style="font-size: 22px; font-weight: bold; color: #0f172a; margin-top: 4px;">${avgCapd}</div>
        </td>
        `}
      </tr>
    </table>

    ${mvp ? `
    <!-- MVP Highlight -->
    <div style="background: #fdf4ff; border: 1px solid #f5d0fe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
      <span style="font-size: 14px; font-weight: bold; color: #86198f;">🏆 Top Performer: ${mvp.agent}</span>
      <span style="font-size: 13px; color: #701a75; margin-left: 12px;">${isSSD ? `${mvp.converted} Converted Cases | ${mvp.signedRate}% Signed Rate | ${mvp.rate}% Case Conv. Rate` : `${mvp.signed} Signed Retainers (${mvp.rate}% Conversion)`}</span>
    </div>
    ` : ''}

    <!-- Detailed Breakdown Table -->
    <h3 style="font-size: 15px; color: #0f172a; margin: 0 0 10px 0;">Specialist Performance Breakdown</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
      <thead>
        <tr style="background: #0f172a; color: #ffffff; text-align: left;">
          <th style="padding: 8px 12px; border: 1px solid #0f172a;">Specialist</th>
          ${isSSD ? `
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Converted</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Signed</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Unsigned</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Signed Rate</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Case Conv. Rate</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">RFC Sent</th>
          ` : `
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Signed</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Unsigned</th>
            <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Conv. Rate</th>
          `}
          <th style="padding: 8px 12px; border: 1px solid #0f172a; text-align: right;">Avg CAPD</th>
        </tr>
      </thead>
      <tbody>
        ${agentRows.map((r, i) => `
          <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: bold; color: #0f172a;">${r.agent}</td>
            ${isSSD ? `
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #15803d; font-weight: bold;">${r.converted}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #1d4ed8;">${r.signed}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #b45309;">${r.unsigned}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${r.signedRate}%</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${r.rate}%</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #be185d;">${r.rfc}</td>
            ` : `
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #15803d; font-weight: bold;">${r.signed}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; color: #b45309;">${r.unsigned}</td>
              <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${r.rate}%</td>
            `}
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; text-align: right;">${r.capdAvg}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Footer -->
    <div style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px;">
      Report generated from Tabak LLC Dashboard · Confidential Internal Report
    </div>
  </div>
  `

  const text = `📊 EOD REPORT - ${lobLabel}\nPeriod: ${dateRangeStr}\n\nSummary:\n` +
    (isSSD 
      ? `- Converted Cases: ${totalConverted}\n- Signed Retainers: ${totalSigned}\n- Signed Rate: ${teamSignedRate}%\n- Case Conv. Rate: ${teamConvRate}%\n- RFC Sent: ${totalRfc}\n`
      : `- Signed Retainers: ${totalSigned}\n- Unsigned: ${totalUnsigned}\n- Conv. Rate: ${teamConvRate}%\n- Avg CAPD: ${avgCapd}\n`) +
    `\nSpecialist Breakdown:\n` +
    agentRows.map(r => isSSD 
      ? `• ${r.agent}: ${r.converted} Converted | ${r.signed} Signed | ${r.signedRate}% Signed Rate | ${r.rate}% Case Conv. Rate` 
      : `• ${r.agent}: ${r.signed} Signed | ${r.unsigned} Unsigned | ${r.rate}% Rate | ${r.capdAvg} CAPD`
    ).join('\n')

  return { html, text }
}
