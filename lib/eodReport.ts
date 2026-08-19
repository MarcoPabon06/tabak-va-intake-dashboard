import { format } from 'date-fns'

export interface PerformanceRow {
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

export interface AppsRow {
  id: number
  lead_id: string
  client_name: string
  date_completed: string
  converted: 'YES' | 'NO'
  reason_not_converted?: string
  other_reason?: string
  rep_name: string
}

export interface EODReportParams {
  lob: string
  from: string
  to: string
  perfData: PerformanceRow[]
  appsData: AppsRow[]
  mtdPerfData?: PerformanceRow[]
  teamLeader?: string
  teamManager?: string
  schedule?: string
}

export function generateEODReportHtml(params: EODReportParams): { html: string; text: string } {
  const {
    lob,
    from,
    to,
    perfData = [],
    appsData = [],
    mtdPerfData = [],
    teamLeader = 'Marco Pabon',
    teamManager = 'Ryan Gwinn',
    schedule = '8AM - 5PM',
  } = params

  // Format date in M/D/YYYY
  const parseDateStr = (dStr: string) => {
    if (!dStr) return new Date()
    const parts = dStr.split('-')
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
    }
    return new Date(dStr)
  }

  const dFrom = parseDateStr(from)
  const dTo = parseDateStr(to)
  const formattedFrom = format(dFrom, 'M/d/yyyy')
  const formattedTo = format(dTo, 'M/d/yyyy')
  const dateDisplay = from === to ? formattedFrom : `${formattedFrom} - ${formattedTo}`

  let lobLabel = 'Veterans Benefits'
  if (lob === 'SSD') lobLabel = 'Social Security Disability'
  if (lob === 'APPS') lobLabel = 'Applications Team'

  // ─────────────────────────────────────────────────────────────
  // 1. APPS DIVISION REPORT
  // ─────────────────────────────────────────────────────────────
  if (lob === 'APPS') {
    const repStats: Record<string, { total: number; converted: number; pending: number }> = {}
    appsData.forEach((e) => {
      const rep = e.rep_name || 'Apps Rep'
      if (!repStats[rep]) repStats[rep] = { total: 0, converted: 0, pending: 0 }
      repStats[rep].total++
      if (e.converted === 'YES') repStats[rep].converted++
      else repStats[rep].pending++
    })

    const repRows = Object.entries(repStats).map(([rep, s]) => ({
      rep,
      total: s.total,
      converted: s.converted,
      pending: s.pending,
      rate: s.total > 0 ? `${Math.round((s.converted / s.total) * 100)}%` : '0%',
    }))

    const totalApps = appsData.length
    const totalConverted = appsData.filter((e) => e.converted === 'YES').length
    const totalPending = appsData.filter((e) => e.converted === 'NO').length
    const overallRate = totalApps > 0 ? `${Math.round((totalConverted / totalApps) * 100)}%` : '0%'

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tabak LLC EOD Report - ${lobLabel}</title>
</head>
<body style="margin: 0; padding: 10px; font-family: Calibri, Arial, sans-serif; background-color: #ffffff; color: #000000;">
  <div style="max-width: 900px; margin: 0 auto;">
    
    <!-- Header & Metadata Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 13px;">
      <tr>
        <th colspan="2" style="background-color: #205527; color: #ffffff; font-size: 16px; font-weight: bold; padding: 6px 10px; text-align: center; border: 1px solid #000000;">
          Tabak LLC EOD Report
        </th>
      </tr>
      <tr>
        <td style="width: 25%; font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">LOB:</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${lobLabel}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Date:</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${dateDisplay}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Team Leader:</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${teamLeader}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Team Manager</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${teamManager}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Schedule</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${schedule}</td>
      </tr>
    </table>

    <!-- Daily Performance Summary Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: center;">
      <thead>
        <tr>
          <th colspan="5" style="background-color: #000000; color: #ffffff; font-size: 14px; font-weight: bold; padding: 6px 10px; text-align: center; border: 1px solid #000000;">
            Daily Performance Summary
          </th>
        </tr>
        <tr style="background-color: #205527; color: #ffffff; font-weight: bold;">
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Agent name</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Apps Filed</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Converted (YES)</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Pending (NO)</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Conv. Rate</th>
        </tr>
      </thead>
      <tbody>
        ${repRows
          .map(
            (r) => `
        <tr style="background-color: #ffffff; color: #000000;">
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.rep}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.total}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.converted}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.pending}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.rate}</td>
        </tr>`
          )
          .join('')}
        <tr style="background-color: #f1f5f9; color: #000000; font-weight: bold;">
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Total</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalApps}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalConverted}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalPending}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${overallRate}</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`

    const text = `Tabak LLC EOD Report - ${lobLabel}\nDate: ${dateDisplay}\nTeam Leader: ${teamLeader} | Manager: ${teamManager}\n\nSummary:\nTotal Apps: ${totalApps} | Converted: ${totalConverted} | Pending: ${totalPending} | Conv. Rate: ${overallRate}\n`
    return { html, text }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. SSD INTAKE DIVISION REPORT (Exact Master Spreadsheet Layout)
  // ─────────────────────────────────────────────────────────────
  if (lob === 'SSD') {
    let presentCount = 0
    let absentCount = 0

    const agentDailyMap: Record<
      string,
      {
        agent_name: string
        capd: number
        inbound_calls: number
        case_rejected: number
        crh: number
        signed_retainers: number
        unsigned_retainers: number
        total_case_wanted: number
        rfc: number
        converted_cases: number
        present: string
      }
    > = {}

    perfData.forEach((row) => {
      const name = row.agent_name ? row.agent_name.trim() : 'Unknown'
      if (!agentDailyMap[name]) {
        agentDailyMap[name] = {
          agent_name: name,
          capd: 0,
          inbound_calls: 0,
          case_rejected: 0,
          crh: 0,
          signed_retainers: 0,
          unsigned_retainers: 0,
          total_case_wanted: 0,
          rfc: 0,
          converted_cases: 0,
          present: row.present || 'SI',
        }
      }
      const a = agentDailyMap[name]
      a.capd += row.capd || 0
      a.inbound_calls += row.inbound_calls || 0
      a.case_rejected += row.case_rejected || 0
      a.crh += row.crh || 0
      a.signed_retainers += row.signed_retainers || 0
      a.unsigned_retainers += row.unsigned_retainers || 0
      a.rfc += row.rfc_sent || 0
      a.converted_cases += row.converted_cases || 0
      a.total_case_wanted += row.total_case_wanted !== undefined ? row.total_case_wanted : ((row.signed_retainers || 0) + (row.unsigned_retainers || 0))
      a.present = row.present || a.present
    })

    Object.values(agentDailyMap).forEach((a) => {
      const status = (a.present || 'SI').toLowerCase()
      if (status.includes('no') || status.includes('absent')) absentCount++
      else presentCount++
    })

    if (Object.keys(agentDailyMap).length === 0) {
      presentCount = 0
      absentCount = 0
    }

    // Month-to-Date (MTD) Calculations per specialist
    const mtdSignedMap: Record<string, number> = {}
    const mtdConvertedMap: Record<string, number> = {}

    const sourceForMtd = mtdPerfData.length > 0 ? mtdPerfData : perfData
    sourceForMtd.forEach((row) => {
      const name = row.agent_name ? row.agent_name.trim() : 'Unknown'
      mtdSignedMap[name] = (mtdSignedMap[name] || 0) + (row.signed_retainers || 0)
      mtdConvertedMap[name] = (mtdConvertedMap[name] || 0) + (row.converted_cases || 0)
    })

    const agentRows = Object.values(agentDailyMap)
      .map((a) => {
        const totalWanted = a.signed_retainers + a.unsigned_retainers
        const successRate = totalWanted > 0 ? `${Math.round((a.signed_retainers / totalWanted) * 100)}%` : '0%'
        const mtdSigned = mtdSignedMap[a.agent_name] !== undefined ? mtdSignedMap[a.agent_name] : a.signed_retainers
        const mtdTransferred = mtdConvertedMap[a.agent_name] !== undefined ? mtdConvertedMap[a.agent_name] : a.converted_cases

        return {
          ...a,
          total_case_wanted: totalWanted,
          successRate,
          mtdSigned,
          mtdTransferred,
        }
      })
      .sort((a, b) => a.agent_name.localeCompare(b.agent_name))

    const totalCapd = agentRows.reduce((sum, r) => sum + r.capd, 0)
    const totalSigned = agentRows.reduce((sum, r) => sum + r.signed_retainers, 0)
    const totalUnsigned = agentRows.reduce((sum, r) => sum + r.unsigned_retainers, 0)
    const totalCaseWanted = totalSigned + totalUnsigned
    const totalRfc = agentRows.reduce((sum, r) => sum + r.rfc, 0)
    const totalCrh = agentRows.reduce((sum, r) => sum + r.crh, 0)
    const totalRejected = agentRows.reduce((sum, r) => sum + r.case_rejected, 0)
    const totalSuccessRate = totalCaseWanted > 0 ? `${Math.round((totalSigned / totalCaseWanted) * 100)}%` : '0%'
    const totalDailyConverted = agentRows.reduce((sum, r) => sum + r.converted_cases, 0)
    const totalMtdSigned = agentRows.reduce((sum, r) => sum + r.mtdSigned, 0)
    const totalMtdTransferred = agentRows.reduce((sum, r) => sum + r.mtdTransferred, 0)

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SSD Intake - EOD Report</title>
</head>
<body style="margin: 0; padding: 10px; font-family: Calibri, Arial, sans-serif; background-color: #ffffff; color: #000000;">
  <div style="max-width: 1100px; margin: 0 auto;">
    
    <!-- 1. Header & Account Details Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 13px;">
      <tr>
        <th colspan="2" style="background-color: #a9d08e; color: #000000; font-size: 15px; font-weight: bold; padding: 6px 10px; text-align: center; border: 1px solid #000000;">
          SSD Intake - EOD Report
        </th>
      </tr>
      <tr>
        <th colspan="2" style="background-color: #c6e0b4; color: #000000; font-size: 13px; font-weight: bold; padding: 4px 10px; text-align: center; border: 1px solid #000000;">
          Account Details
        </th>
      </tr>
      <tr>
        <td style="width: 30%; font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Client</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Tabak Law LLC</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">LOB</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Social Security Disability (SSD)</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Date</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${dateDisplay}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Team Leader</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${teamLeader}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Manager</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${teamManager}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Schedule</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">8 a.m. - 5 p.m CDT</td>
      </tr>
    </table>

    <!-- 2. Headcount Details Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 13px;">
      <tr>
        <th colspan="2" style="background-color: #c6e0b4; color: #000000; font-size: 13px; font-weight: bold; padding: 4px 10px; text-align: center; border: 1px solid #000000;">
          Headcount Details
        </th>
      </tr>
      <tr>
        <td style="width: 30%; font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Present</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${presentCount}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Absent</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${absentCount}</td>
      </tr>
    </table>

    <!-- 3. MTD Transferred Cases Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 13px;">
      <tr>
        <th colspan="2" style="background-color: #c6e0b4; color: #000000; font-size: 13px; font-weight: bold; padding: 4px 10px; text-align: center; border: 1px solid #000000;">
          MTD Transferred Cases
        </th>
      </tr>
      <tr>
        <td style="width: 30%; font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">Total Transferred Cases</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${totalMtdTransferred}</td>
      </tr>
    </table>

    <!-- 4. SSD Intake Team Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: center;">
      <thead>
        <tr>
          <th colspan="12" style="background-color: #a9d08e; color: #000000; font-size: 13px; font-weight: bold; padding: 6px 10px; text-align: left; border: 1px solid #000000;">
            Social Security Disability - Intake Team
          </th>
        </tr>
        <tr style="background-color: #a9d08e; color: #000000; font-weight: bold; font-size: 12px;">
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: left;">Agent Name</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">CAPD</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">Signed</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">Unsigned</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">Total Case Wanted</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">RFC</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">CRH</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">Case Rejected</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">Signed Percentage</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">Daily Transferred Cases</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">MTD Signed Cases</th>
          <th style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">MTD Transferred Cases</th>
        </tr>
      </thead>
      <tbody>
        ${agentRows
          .map(
            (r) => `
        <tr style="background-color: #ffffff; color: #000000;">
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: left;">${r.agent_name}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.capd}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.signed_retainers}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.unsigned_retainers}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.total_case_wanted}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.rfc}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.crh}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.case_rejected}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.successRate}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.converted_cases}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.mtdSigned}</td>
          <td style="padding: 5px 6px; border: 1px solid #000000; text-align: center;">${r.mtdTransferred}</td>
        </tr>`
          )
          .join('')}
        <tr style="background-color: #d9d9d9; color: #000000; font-weight: bold;">
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: left;">Total</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalCapd}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalSigned}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalUnsigned}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalCaseWanted}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalRfc}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalCrh}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalRejected}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalSuccessRate}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalDailyConverted}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalMtdSigned}</td>
          <td style="padding: 6px 6px; border: 1px solid #000000; text-align: center;">${totalMtdTransferred}</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`

    const text = `SSD Intake - EOD Report\nDate: ${dateDisplay}\nTeam Leader: ${teamLeader} | Manager: ${teamManager}\nHeadcount: Present: ${presentCount} | Absent: ${absentCount}\nMTD Transferred Cases: ${totalMtdTransferred}\n\nSummary:\nTotal Signed: ${totalSigned} | Unsigned: ${totalUnsigned} | Case Wanted: ${totalCaseWanted} | RFC: ${totalRfc} | CRH: ${totalCrh} | Rejected: ${totalRejected} | Signed %: ${totalSuccessRate} | Daily Transferred: ${totalDailyConverted} | MTD Signed: ${totalMtdSigned} | MTD Transferred: ${totalMtdTransferred}\n`
    return { html, text }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. VA / INTAKE DIVISION REPORT (Exact Spreadsheet Layout)
  // ─────────────────────────────────────────────────────────────

  // Attendance Counts
  let presentCount = 0
  let tardyCount = 0
  let absentCount = 0

  // Group performance rows by Agent for the selected date
  const agentDailyMap: Record<
    string,
    {
      agent_name: string
      capd: number
      inbound_calls: number
      case_rejected: number
      crh: number
      signed_retainers: number
      unsigned_retainers: number
      total_case_wanted: number
      present: string
    }
  > = {}

  perfData.forEach((row) => {
    const name = row.agent_name ? row.agent_name.trim() : 'Unknown'
    if (!agentDailyMap[name]) {
      agentDailyMap[name] = {
        agent_name: name,
        capd: 0,
        inbound_calls: 0,
        case_rejected: 0,
        crh: 0,
        signed_retainers: 0,
        unsigned_retainers: 0,
        total_case_wanted: 0,
        present: row.present || 'Present',
      }
    }
    const a = agentDailyMap[name]
    a.capd += row.capd || 0
    a.inbound_calls += row.inbound_calls || 0
    a.case_rejected += row.case_rejected || 0
    a.crh += row.crh || 0
    a.signed_retainers += row.signed_retainers || 0
    a.unsigned_retainers += row.unsigned_retainers || 0
    a.total_case_wanted += row.total_case_wanted !== undefined ? row.total_case_wanted : ((row.signed_retainers || 0) + (row.unsigned_retainers || 0))
    a.present = row.present || a.present
  })

  // Calculate Attendance counts from all agents logged
  Object.values(agentDailyMap).forEach((a) => {
    const status = (a.present || 'Present').toLowerCase()
    if (status.includes('tardy')) tardyCount++
    else if (status.includes('absent')) absentCount++
    else presentCount++
  })

  // If no rows were present, fallback
  if (Object.keys(agentDailyMap).length === 0) {
    presentCount = 0
    tardyCount = 0
    absentCount = 0
  }

  // Calculate Month-to-Date (MTD) Running Retainers per specialist
  const mtdSignedMap: Record<string, number> = {}
  const mtdUnsignedMap: Record<string, number> = {}

  const sourceForMtd = mtdPerfData.length > 0 ? mtdPerfData : perfData
  sourceForMtd.forEach((row) => {
    const name = row.agent_name ? row.agent_name.trim() : 'Unknown'
    mtdSignedMap[name] = (mtdSignedMap[name] || 0) + (row.signed_retainers || 0)
    mtdUnsignedMap[name] = (mtdUnsignedMap[name] || 0) + (row.unsigned_retainers || 0)
  })

  // Build sorted agent rows
  const agentRows = Object.values(agentDailyMap)
    .map((a) => {
      const totalWanted = a.signed_retainers + a.unsigned_retainers
      const successRate = totalWanted > 0 ? `${Math.round((a.signed_retainers / totalWanted) * 100)}%` : '100%'
      const runningSigned = mtdSignedMap[a.agent_name] !== undefined ? mtdSignedMap[a.agent_name] : a.signed_retainers
      const runningUnsigned = mtdUnsignedMap[a.agent_name] !== undefined ? mtdUnsignedMap[a.agent_name] : a.unsigned_retainers

      return {
        ...a,
        total_case_wanted: totalWanted,
        successRate,
        runningSigned,
        runningUnsigned,
      }
    })
    .sort((a, b) => a.agent_name.localeCompare(b.agent_name))

  // Calculate Totals
  const totalCapd = agentRows.reduce((sum, r) => sum + r.capd, 0)
  const totalInbound = agentRows.reduce((sum, r) => sum + r.inbound_calls, 0)
  const totalRejected = agentRows.reduce((sum, r) => sum + r.case_rejected, 0)
  const totalCrh = agentRows.reduce((sum, r) => sum + r.crh, 0)
  const totalSigned = agentRows.reduce((sum, r) => sum + r.signed_retainers, 0)
  const totalUnsigned = agentRows.reduce((sum, r) => sum + r.unsigned_retainers, 0)
  const totalCaseWanted = totalSigned + totalUnsigned
  const totalSuccessRate = totalCaseWanted > 0 ? `${Math.round((totalSigned / totalCaseWanted) * 100)}%` : '100%'
  const totalRunningSigned = agentRows.reduce((sum, r) => sum + r.runningSigned, 0)
  const totalRunningUnsigned = agentRows.reduce((sum, r) => sum + r.runningUnsigned, 0)

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Tabak LLC EOD Report - ${lobLabel}</title>
</head>
<body style="margin: 0; padding: 10px; font-family: Calibri, Arial, sans-serif; background-color: #ffffff; color: #000000;">
  <div style="max-width: 1050px; margin: 0 auto;">
    
    <!-- 1. Header & Metadata Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 13px;">
      <tr>
        <th colspan="2" style="background-color: #205527; color: #ffffff; font-size: 16px; font-weight: bold; padding: 6px 10px; text-align: center; border: 1px solid #000000;">
          Tabak LLC EOD Report
        </th>
      </tr>
      <tr>
        <td style="width: 25%; font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">LOB:</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${lobLabel}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Date:</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${dateDisplay}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Team Leader:</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${teamLeader}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Team Manager</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${teamManager}</td>
      </tr>
      <tr>
        <td style="font-weight: bold; padding: 4px 8px; border: 1px solid #000000; text-align: right; background-color: #ffffff;">Schedule</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${schedule}</td>
      </tr>
    </table>

    <!-- 2. Attendance Table -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; font-size: 13px;">
      <tr>
        <th colspan="4" style="background-color: #000000; color: #ffffff; font-size: 14px; font-weight: bold; padding: 5px 10px; text-align: center; border: 1px solid #000000;">
          Attendance
        </th>
      </tr>
      <tr>
        <td style="width: 25%; font-weight: 500; padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;">Present</td>
        <td style="width: 25%; padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${presentCount}</td>
        <td style="width: 25%; padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;"></td>
        <td style="width: 25%; padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;"></td>
      </tr>
      <tr>
        <td style="font-weight: 500; padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;">Tardy</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${tardyCount}</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;"></td>
        <td style="padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;"></td>
      </tr>
      <tr>
        <td style="font-weight: 500; padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;">Absent</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; text-align: center; background-color: #ffffff;">${absentCount}</td>
        <td style="padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;"></td>
        <td style="padding: 4px 8px; border: 1px solid #000000; background-color: #ffffff;"></td>
      </tr>
    </table>

    <!-- 3. Daily Performance Summary Table -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: center;">
      <thead>
        <tr>
          <th colspan="11" style="background-color: #000000; color: #ffffff; font-size: 14px; font-weight: bold; padding: 6px 10px; text-align: center; border: 1px solid #000000;">
            Daily Performance Summary
          </th>
        </tr>
        <tr style="background-color: #205527; color: #ffffff; font-weight: bold; font-size: 12px;">
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Agent name</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">CAPD</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Inbound calls</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Case Rejected</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">CRH</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Signed Retainers</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Unsigned</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Total Case Wanted</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Signed success rate</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Running Signed Retainers</th>
          <th style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Running Unsigned Retainers</th>
        </tr>
      </thead>
      <tbody>
        ${agentRows
          .map(
            (r) => `
        <tr style="background-color: #ffffff; color: #000000;">
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.agent_name}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.capd}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.inbound_calls}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.case_rejected}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.crh}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.signed_retainers}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.unsigned_retainers}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.total_case_wanted}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.successRate}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.runningSigned}</td>
          <td style="padding: 5px 8px; border: 1px solid #000000; text-align: center;">${r.runningUnsigned}</td>
        </tr>`
          )
          .join('')}
        <tr style="background-color: #f1f5f9; color: #000000; font-weight: bold;">
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">Total</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalCapd}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalInbound}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalRejected}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalCrh}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalSigned}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalUnsigned}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalCaseWanted}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalSuccessRate}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalRunningSigned}</td>
          <td style="padding: 6px 8px; border: 1px solid #000000; text-align: center;">${totalRunningUnsigned}</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`

  const text = `Tabak LLC EOD Report - ${lobLabel}\nDate: ${dateDisplay}\nTeam Leader: ${teamLeader} | Manager: ${teamManager} | Schedule: ${schedule}\n\nAttendance:\nPresent: ${presentCount} | Tardy: ${tardyCount} | Absent: ${absentCount}\n\nDaily Performance Summary:\nTotal: CAPD ${totalCapd} | Inbound ${totalInbound} | Rejected ${totalRejected} | CRH ${totalCrh} | Signed ${totalSigned} | Unsigned ${totalUnsigned} | Total Case Wanted ${totalCaseWanted} | Signed Rate ${totalSuccessRate} | Running Signed ${totalRunningSigned} | Running Unsigned ${totalRunningUnsigned}\n`

  return { html, text }
}
