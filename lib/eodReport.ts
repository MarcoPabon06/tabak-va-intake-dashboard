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

  const themeColor = lob === 'SSD' ? '#be185d' : lob === 'APPS' ? '#1d4ed8' : '#b82105'

  // Outlook Dark Mode CSS Overrides snippet
  const headStyle = `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <style>
      :root { color-scheme: light dark; supported-color-schemes: light dark; }
      @media (prefers-color-scheme: dark) {
        .eod-container { background-color: #0f172a !important; color: #ffffff !important; border-color: #334155 !important; }
        .eod-title { color: #ffffff !important; }
        .eod-sub { color: #cbd5e1 !important; }
        .eod-card { background-color: #1e293b !important; border-color: #475569 !important; }
        .eod-card-label { color: #cbd5e1 !important; }
        .eod-card-val-green { color: #34d399 !important; }
        .eod-card-val-blue { color: #60a5fa !important; }
        .eod-card-val-purple { color: #c084fc !important; }
        .eod-card-val-pink { color: #f472b6 !important; }
        .eod-card-val-amber { color: #fbbf24 !important; }
        .eod-card-val-dark { color: #ffffff !important; }
        .eod-mvp { background-color: #31103f !important; border-color: #a855f7 !important; color: #f5d0fe !important; }
        .eod-mvp-text { color: #f0abfc !important; }
        .eod-table-th { background-color: #1e293b !important; color: #ffffff !important; border-color: #475569 !important; }
        .eod-row-even { background-color: #0f172a !important; color: #ffffff !important; }
        .eod-row-odd { background-color: #1e293b !important; color: #ffffff !important; }
        .eod-td { border-color: #334155 !important; color: #ffffff !important; }
        .eod-td-bold { color: #ffffff !important; }
        .eod-td-green { color: #34d399 !important; }
        .eod-td-blue { color: #60a5fa !important; }
        .eod-td-amber { color: #fbbf24 !important; }
        .eod-td-pink { color: #f472b6 !important; }
      }
      [data-ogsc] .eod-container { background-color: #0f172a !important; color: #ffffff !important; }
      [data-ogsc] .eod-card { background-color: #1e293b !important; border-color: #475569 !important; }
      [data-ogsc] .eod-card-label { color: #cbd5e1 !important; }
      [data-ogsc] .eod-table-th { background-color: #1e293b !important; color: #ffffff !important; }
      [data-ogsc] .eod-td { color: #ffffff !important; }
    </style>
  `

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
    <!DOCTYPE html>
    <html>
    <head>
      ${headStyle}
    </head>
    <body style="margin: 0; padding: 0; background-color: #ffffff;">
      <div class="eod-container" style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; color: #0f172a; line-height: 1.5; background: #ffffff; padding: 22px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 0 auto;">
        
        <!-- Header -->
        <div style="border-bottom: 3px solid ${themeColor}; padding-bottom: 12px; margin-bottom: 18px;">
          <h2 class="eod-title" style="color: #0f172a; margin: 0 0 4px 0; font-size: 20px; font-weight: 800;">📲 End of Day (EOD) Performance Report</h2>
          <div class="eod-sub" style="color: #475569; font-size: 13px; font-weight: 600;">
            <strong>Division:</strong> ${lobLabel} &nbsp;|&nbsp; <strong>Period:</strong> ${dateRangeStr}
          </div>
        </div>

        <!-- Executive Summary Cards -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td class="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
              <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Total Apps</div>
              <div class="eod-card-val-dark" style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${totalApps}</div>
            </td>
            <td className="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
              <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Converted (YES)</div>
              <div class="eod-card-val-green" style="font-size: 22px; font-weight: 800; color: #047857; margin-top: 4px;">${convertedApps}</div>
            </td>
            <td className="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
              <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Pending (NO)</div>
              <div class="eod-card-val-amber" style="font-size: 22px; font-weight: 800; color: #b45309; margin-top: 4px;">${pendingApps}</div>
            </td>
            <td className="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
              <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Conv. Rate</div>
              <div class="eod-card-val-blue" style="font-size: 22px; font-weight: 800; color: #1d4ed8; margin-top: 4px;">${rate}%</div>
            </td>
          </tr>
        </table>

        ${mvp ? `
        <!-- MVP Highlight -->
        <div class="eod-mvp" style="background: #fdf4ff; border: 1px solid #d8b4fe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
          <span style="font-size: 14px; font-weight: bold; color: #7e22ce;">🏆 Top Performer: ${mvp.rep}</span>
          <span class="eod-mvp-text" style="font-size: 13px; color: #6b21a8; font-weight: 600; margin-left: 12px;">${mvp.converted} Converted Cases (${mvp.rate}% Conversion)</span>
        </div>
        ` : ''}

        <!-- Detailed Breakdown Table -->
        <h3 class="eod-title" style="font-size: 15px; color: #0f172a; margin: 0 0 10px 0; font-weight: 800;">Representative Breakdown</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
          <thead>
            <tr>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: left;">Representative</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Apps Filed</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Converted</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Pending</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Conv. Rate</th>
            </tr>
          </thead>
          <tbody>
            ${repRows.map((r, i) => `
              <tr class="${i % 2 === 0 ? 'eod-row-even' : 'eod-row-odd'}" style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td class="eod-td eod-td-bold" style="padding: 9px 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${r.rep}</td>
                <td class="eod-td" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #0f172a;">${r.total}</td>
                <td class="eod-td eod-td-green" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #047857; font-weight: bold;">${r.converted}</td>
                <td class="eod-td eod-td-amber" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #b45309;">${r.pending}</td>
                <td class="eod-td eod-td-blue" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #1d4ed8;">${r.rate}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Footer -->
        <div class="eod-sub" style="font-size: 11px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 10px; text-align: center;">
          Report generated from Tabak LLC Dashboard · Confidential Internal Report
        </div>
      </div>
    </body>
    </html>
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
  <!DOCTYPE html>
  <html>
  <head>
    ${headStyle}
  </head>
  <body style="margin: 0; padding: 0; background-color: #ffffff;">
    <div class="eod-container" style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; color: #0f172a; line-height: 1.5; background: #ffffff; padding: 22px; border-radius: 8px; border: 1px solid #cbd5e1; margin: 0 auto;">
      
      <!-- Header -->
      <div style="border-bottom: 3px solid ${themeColor}; padding-bottom: 12px; margin-bottom: 18px;">
        <h2 class="eod-title" style="color: #0f172a; margin: 0 0 4px 0; font-size: 20px; font-weight: 800;">📊 End of Day (EOD) Performance Report</h2>
        <div class="eod-sub" style="color: #475569; font-size: 13px; font-weight: 600;">
          <strong>Division:</strong> ${lobLabel} &nbsp;|&nbsp; <strong>Period:</strong> ${dateRangeStr}
        </div>
      </div>

      <!-- Executive Summary Cards -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          ${isSSD ? `
          <td class="eod-card" style="width: 20%; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 10px; color: #475569; font-weight: bold; text-transform: uppercase;">Converted Cases</div>
            <div class="eod-card-val-green" style="font-size: 20px; font-weight: 800; color: #047857; margin-top: 4px;">${totalConverted}</div>
          </td>
          <td class="eod-card" style="width: 20%; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 10px; color: #475569; font-weight: bold; text-transform: uppercase;">Signed Retainers</div>
            <div class="eod-card-val-blue" style="font-size: 20px; font-weight: 800; color: #1d4ed8; margin-top: 4px;">${totalSigned}</div>
          </td>
          <td class="eod-card" style="width: 20%; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 10px; color: #475569; font-weight: bold; text-transform: uppercase;">Signed Rate</div>
            <div class="eod-card-val-purple" style="font-size: 20px; font-weight: 800; color: #7e22ce; margin-top: 4px;">${teamSignedRate}%</div>
          </td>
          <td class="eod-card" style="width: 20%; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 10px; color: #475569; font-weight: bold; text-transform: uppercase;">Case Conv. Rate</div>
            <div class="eod-card-val-pink" style="font-size: 20px; font-weight: 800; color: #be185d; margin-top: 4px;">${teamConvRate}%</div>
          </td>
          <td class="eod-card" style="width: 20%; padding: 10px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 10px; color: #475569; font-weight: bold; text-transform: uppercase;">RFC Sent</div>
            <div class="eod-card-val-dark" style="font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 4px;">${totalRfc}</div>
          </td>
          ` : `
          <td class="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Signed Retainers</div>
            <div class="eod-card-val-green" style="font-size: 22px; font-weight: 800; color: #047857; margin-top: 4px;">${totalSigned}</div>
          </td>
          <td class="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Unsigned</div>
            <div class="eod-card-val-amber" style="font-size: 22px; font-weight: 800; color: #b45309; margin-top: 4px;">${totalUnsigned}</div>
          </td>
          <td class="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Conv. Rate</div>
            <div class="eod-card-val-blue" style="font-size: 22px; font-weight: 800; color: #1d4ed8; margin-top: 4px;">${teamConvRate}%</div>
          </td>
          <td class="eod-card" style="width: 25%; padding: 12px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; text-align: center;">
            <div class="eod-card-label" style="font-size: 11px; color: #475569; font-weight: bold; text-transform: uppercase;">Avg CAPD</div>
            <div class="eod-card-val-dark" style="font-size: 22px; font-weight: 800; color: #0f172a; margin-top: 4px;">${avgCapd}</div>
          </td>
          `}
        </tr>
      </table>

      ${mvp ? `
      <!-- MVP Highlight -->
      <div class="eod-mvp" style="background: #fdf4ff; border: 1px solid #d8b4fe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
        <span style="font-size: 14px; font-weight: bold; color: #7e22ce;">🏆 Top Performer: ${mvp.agent}</span>
        <span class="eod-mvp-text" style="font-size: 13px; color: #6b21a8; font-weight: 600; margin-left: 12px;">${isSSD ? `${mvp.converted} Converted Cases (${mvp.signedRate}% Signed | ${mvp.rate}% Case Conv.)` : `${mvp.signed} Signed Retainers (${mvp.rate}% Conversion)`}</span>
      </div>
      ` : ''}

      <!-- Detailed Breakdown Table -->
      <h3 class="eod-title" style="font-size: 15px; color: #0f172a; margin: 0 0 10px 0; font-weight: 800;">Specialist Performance Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 16px;">
        <thead>
          <tr>
            <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: left;">Specialist</th>
            ${isSSD ? `
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Converted</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Signed</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Unsigned</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Signed Rate</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Case Conv. Rate</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">RFC Sent</th>
            ` : `
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Signed</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Unsigned</th>
              <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Conv. Rate</th>
            `}
            <th class="eod-table-th" style="padding: 10px 12px; background-color: #1e293b; color: #ffffff !important; font-weight: bold; border: 1px solid #1e293b; text-align: right;">Avg CAPD</th>
          </tr>
        </thead>
        <tbody>
          ${agentRows.map((r, i) => `
            <tr class="${i % 2 === 0 ? 'eod-row-even' : 'eod-row-odd'}" style="background-color: ${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
              <td class="eod-td eod-td-bold" style="padding: 9px 12px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${r.agent}</td>
              ${isSSD ? `
                <td class="eod-td eod-td-green" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #047857; font-weight: bold;">${r.converted}</td>
                <td class="eod-td eod-td-blue" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #1d4ed8;">${r.signed}</td>
                <td class="eod-td eod-td-amber" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #b45309;">${r.unsigned}</td>
                <td class="eod-td" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #7e22ce;">${r.signedRate}%</td>
                <td class="eod-td eod-td-pink" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #be185d;">${r.rate}%</td>
                <td class="eod-td" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #0f172a;">${r.rfc}</td>
              ` : `
                <td class="eod-td eod-td-green" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #047857; font-weight: bold;">${r.signed}</td>
                <td class="eod-td eod-td-amber" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #b45309;">${r.unsigned}</td>
                <td class="eod-td eod-td-blue" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; color: #1d4ed8;">${r.rate}%</td>
              `}
              <td class="eod-td" style="padding: 9px 12px; border: 1px solid #cbd5e1; text-align: right; color: #0f172a;">${r.capdAvg}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Footer -->
      <div class="eod-sub" style="font-size: 11px; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 10px; text-align: center;">
        Report generated from Tabak LLC Dashboard · Confidential Internal Report
      </div>
    </div>
  </body>
  </html>
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
