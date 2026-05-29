'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

const AGENT_COLORS: Record<string, string> = {
  'Daniel Castillo': '#6366f1',
  'Adriana Soto': '#ec4899',
  'Oliver Ortega': '#10b981',
  'Alejandra NicoleReyes': '#f59e0b',
  'Omar Soto': '#3b82f6',
}
const ALL_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#06b6d4']

interface Row {
  agent_name: string
  capd: number
}

interface Props {
  data: Row[]
}

export default function CAPDBarChart({ data }: Props) {
  // Aggregate per agent
  const byAgent: Record<string, { total: number; days: number }> = {}
  for (const row of data) {
    if (!byAgent[row.agent_name]) byAgent[row.agent_name] = { total: 0, days: 0 }
    byAgent[row.agent_name].total += row.capd || 0
    byAgent[row.agent_name].days += 1
  }

  const chartData = Object.entries(byAgent)
    .map(([agent, vals]) => ({
      agent: agent.split(' ')[0], // first name for display
      fullName: agent,
      avg_capd: vals.days > 0 ? Math.round(vals.total / vals.days) : 0,
      total_capd: vals.total,
    }))
    .sort((a, b) => b.avg_capd - a.avg_capd)

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{
        background: 'rgba(10,22,40,0.97)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: '#f8fafc' }}>{d.fullName}</div>
        <div style={{ color: '#94a3b8' }}>Avg CAPD: <span style={{ color: '#6366f1', fontWeight: 700 }}>{d.avg_capd}</span></div>
        <div style={{ color: '#94a3b8' }}>Total Calls: <span style={{ color: '#94a3b8', fontWeight: 600 }}>{d.total_capd.toLocaleString()}</span></div>
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ padding: '20px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Avg Calls Per Day (CAPD)
        </h3>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(99,102,241,0.1)', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.2)' }}>
          Target: 40 calls/day
        </span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="agent" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
          <ReferenceLine y={40} stroke="rgba(99,102,241,0.5)" strokeDasharray="6 3" label={{ value: '40', position: 'right', fill: '#6366f1', fontSize: 11 }} />
          <Bar dataKey="avg_capd" radius={[6, 6, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={entry.fullName}
                fill={AGENT_COLORS[entry.fullName] || ALL_COLORS[i % ALL_COLORS.length]}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
