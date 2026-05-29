'use client'

interface Row {
  date: string
  agent_name: string
  capd: number
  inbound_calls: number
  case_rejected: number
  crh: number
  signed_retainers: number
  unsigned_retainers: number
  total_case_wanted: number
  signed_success_rate: number
  present: string
}

interface Props {
  data: Row[]
}

interface Card {
  id: string
  label: string
  value: string | number
  sub?: string
  color: string
  icon: string
  trend?: 'up' | 'down' | 'neutral'
}

export default function SummaryCards({ data }: Props) {
  const totalSigned = data.reduce((s, r) => s + (r.signed_retainers || 0), 0)
  const totalUnsigned = data.reduce((s, r) => s + (r.unsigned_retainers || 0), 0)
  const totalCases = totalSigned + totalUnsigned
  const convRate = totalCases > 0 ? (totalSigned / totalCases) * 100 : 0
  const totalCrh = data.reduce((s, r) => s + (r.crh || 0), 0)
  const totalRejected = data.reduce((s, r) => s + (r.case_rejected || 0), 0)

  // CAPD avg (only present days)
  const presentRows = data.filter((r) => r.present === 'SI')
  const avgCapd = presentRows.length > 0
    ? Math.round(presentRows.reduce((s, r) => s + (r.capd || 0), 0) / presentRows.length)
    : 0

  // Unique working days
  const uniqueDays = new Set(data.map((r) => r.date)).size

  const cards: Card[] = [
    {
      id: 'card-signed',
      label: 'Signed Retainers',
      value: totalSigned,
      sub: `${uniqueDays} days tracked`,
      color: '#10b981',
      icon: '✅',
    },
    {
      id: 'card-conversion',
      label: 'Conversion Rate',
      value: `${convRate.toFixed(1)}%`,
      sub: `${totalSigned} signed / ${totalCases} total`,
      color: '#6366f1',
      icon: '📈',
      trend: convRate >= 65 ? 'up' : convRate >= 50 ? 'neutral' : 'down',
    },
    {
      id: 'card-unsigned',
      label: 'Unsigned Retainers',
      value: totalUnsigned,
      sub: `Pending conversions`,
      color: '#f59e0b',
      icon: '⏳',
    },
    {
      id: 'card-capd',
      label: 'Avg CAPD',
      value: avgCapd,
      sub: `Target: 40 calls/day`,
      color: avgCapd >= 40 ? '#10b981' : '#f59e0b',
      icon: '📞',
      trend: avgCapd >= 40 ? 'up' : 'down',
    },
    {
      id: 'card-crh',
      label: 'Client Refused Help',
      value: totalCrh,
      sub: `Across all agents`,
      color: '#ef4444',
      icon: '🚫',
    },
    {
      id: 'card-rejected',
      label: 'Cases Rejected',
      value: totalRejected,
      sub: `Across all agents`,
      color: '#94a3b8',
      icon: '❌',
    },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 14,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.id}
          id={card.id}
          className="glass-card fade-in"
          style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}
        >
          {/* Background glow */}
          <div style={{
            position: 'absolute', top: -20, right: -20, width: 80, height: 80,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${card.color}20 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>{card.icon}</span>
            {card.trend && (
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: card.trend === 'up' ? '#10b981' : card.trend === 'down' ? '#ef4444' : '#f59e0b',
              }}>
                {card.trend === 'up' ? '▲' : card.trend === 'down' ? '▼' : '●'}
              </span>
            )}
          </div>

          <div style={{
            fontSize: 28, fontWeight: 800,
            color: card.color,
            lineHeight: 1,
            marginBottom: 4,
            letterSpacing: '-0.02em',
          }}>
            {card.value}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {card.label}
          </div>
          {card.sub && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{card.sub}</div>
          )}
        </div>
      ))}
    </div>
  )
}
