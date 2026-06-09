'use client'

interface Row {
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

interface Props {
  data: Row[]
  lob?: string
}

const AGENT_COLORS: Record<string, string> = {
  'Daniel Castillo': '#6366f1',
  'Adriana Soto': '#ec4899',
  'Oliver Ortega': '#10b981',
  'Alejandra NicoleReyes': '#f59e0b',
  'Omar Soto': '#3b82f6',
}
const ALL_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6']

function getRateColor(rate: number) {
  if (rate >= 0.75) return '#10b981'
  if (rate >= 0.5) return '#6366f1'
  if (rate >= 0.25) return '#f59e0b'
  return '#ef4444'
}

export default function Leaderboard({ data, lob = 'VA' }: Props) {
  // Aggregate per agent
  const byAgent: Record<string, {
    signed: number; unsigned: number; total: number
    converted: number; rfc: number
    capd_total: number; capd_days: number
    crh: number; rejected: number; inbound: number
  }> = {}

  for (const row of data) {
    if (!byAgent[row.agent_name]) {
      byAgent[row.agent_name] = { signed: 0, unsigned: 0, total: 0, converted: 0, rfc: 0, capd_total: 0, capd_days: 0, crh: 0, rejected: 0, inbound: 0 }
    }
    const a = byAgent[row.agent_name]
    a.signed += row.signed_retainers || 0
    a.unsigned += row.unsigned_retainers || 0
    a.converted += row.converted_cases || 0
    a.rfc += row.rfc_sent || 0
    a.total += row.total_case_wanted || 0
    a.capd_total += row.capd || 0
    a.capd_days += 1
    a.crh += row.crh || 0
    a.rejected += row.case_rejected || 0
    a.inbound += row.inbound_calls || 0
  }

  const rows = Object.entries(byAgent)
    .map(([agent, vals]) => {
      let rate = 0
      if (lob === 'SSD') {
        rate = vals.signed > 0 ? vals.converted / vals.signed : 0
      } else {
        const total = vals.signed + vals.unsigned
        rate = total > 0 ? vals.signed / total : 0
      }
      const avgCapd = vals.capd_days > 0 ? Math.round(vals.capd_total / vals.capd_days) : 0
      return { agent, rate, avgCapd, ...vals }
    })
    .sort((a, b) => {
      if (lob === 'SSD') {
        return b.converted - a.converted
      }
      return b.signed - a.signed
    })

  return (
    <div className="glass-card" style={{ padding: '20px 0' }}>
      <div style={{ padding: '0 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Agent Leaderboard
        </h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rows.length} agents</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              {lob === 'SSD' ? (
                <>
                  <th style={{ textAlign: 'right' }}>Converted</th>
                  <th style={{ textAlign: 'right' }}>Signed</th>
                  <th style={{ textAlign: 'right' }}>RFC Sent</th>
                  <th style={{ textAlign: 'right' }}>Conv. Rate</th>
                </>
              ) : lob === 'VA' ? (
                <>
                  <th style={{ textAlign: 'right' }}>Signed</th>
                  <th style={{ textAlign: 'right' }}>Unsigned</th>
                  <th style={{ textAlign: 'right' }}>Conv. Rate</th>
                </>
              ) : (
                <>
                  <th style={{ textAlign: 'right' }}>Signed</th>
                  <th style={{ textAlign: 'right' }}>Converted</th>
                  <th style={{ textAlign: 'right' }}>Unsigned</th>
                  <th style={{ textAlign: 'right' }}>RFC Sent</th>
                </>
              )}
              <th style={{ textAlign: 'right' }}>Avg CAPD</th>
              <th style={{ textAlign: 'right' }}>Inbound</th>
              <th style={{ textAlign: 'right' }}>CRH</th>
              <th style={{ textAlign: 'right' }}>Rejected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const color = AGENT_COLORS[row.agent] || ALL_COLORS[i % ALL_COLORS.length]
              return (
                <tr key={row.agent}>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: i === 0 ? 'rgba(245,158,11,0.2)' : i === 1 ? 'rgba(148,163,184,0.15)' : i === 2 ? 'rgba(180,120,60,0.15)' : 'rgba(255,255,255,0.05)',
                      color: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b4783c' : '#475569',
                    }}>
                      {i + 1}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: color, flexShrink: 0,
                        boxShadow: `0 0 6px ${color}`,
                      }} />
                      <span style={{ fontWeight: 600 }}>{row.agent}</span>
                    </div>
                  </td>
                  {lob === 'SSD' ? (
                    <>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{row.converted}</td>
                      <td style={{ textAlign: 'right', color: '#3b82f6' }}>{row.signed}</td>
                      <td style={{ textAlign: 'right', color: '#ec4899' }}>{row.rfc}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 700,
                          color: getRateColor(row.rate),
                          background: `${getRateColor(row.rate)}18`,
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 13,
                        }}>
                          {(row.rate * 100).toFixed(1)}%
                        </span>
                      </td>
                    </>
                  ) : lob === 'VA' ? (
                    <>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{row.signed}</td>
                      <td style={{ textAlign: 'right', color: '#f59e0b' }}>{row.unsigned}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span style={{
                          fontWeight: 700,
                          color: getRateColor(row.rate),
                          background: `${getRateColor(row.rate)}18`,
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 13,
                        }}>
                          {(row.rate * 100).toFixed(1)}%
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>{row.signed}</td>
                      <td style={{ textAlign: 'right', color: '#10b981' }}>{row.converted}</td>
                      <td style={{ textAlign: 'right', color: '#f59e0b' }}>{row.unsigned}</td>
                      <td style={{ textAlign: 'right', color: '#ec4899' }}>{row.rfc}</td>
                    </>
                  )}
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ color: row.avgCapd >= 40 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {row.avgCapd}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{row.inbound}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{row.crh}</td>
                  <td style={{ textAlign: 'right', color: row.rejected > 0 ? '#ef4444' : 'var(--text-muted)' }}>{row.rejected}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
