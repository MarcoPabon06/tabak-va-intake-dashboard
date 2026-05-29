'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const AGENT_COLORS: Record<string, string> = {
  'Daniel Castillo': '#6366f1',
  'Adriana Soto': '#ec4899',
  'Oliver Ortega': '#10b981',
  'Alejandra NicoleReyes': '#f59e0b',
  'Omar Soto': '#3b82f6',
}
const ALL_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6']

interface Row {
  agent_name: string
  signed_retainers: number
  unsigned_retainers: number
  total_case_wanted: number
}

interface Props {
  data: Row[]
}

export default function ConversionChart({ data }: Props) {
  const byAgent: Record<string, { signed: number; unsigned: number }> = {}
  for (const row of data) {
    if (!byAgent[row.agent_name]) byAgent[row.agent_name] = { signed: 0, unsigned: 0 }
    byAgent[row.agent_name].signed += row.signed_retainers || 0
    byAgent[row.agent_name].unsigned += row.unsigned_retainers || 0
  }

  const chartData = Object.entries(byAgent)
    .map(([agent, vals]) => {
      const total = vals.signed + vals.unsigned
      return {
        agent: agent.split(' ')[0],
        fullName: agent,
        Signed: vals.signed,
        Unsigned: vals.unsigned,
        rate: total > 0 ? Math.round((vals.signed / total) * 100) : 0,
      }
    })
    .sort((a, b) => b.Signed - a.Signed)

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: 'rgba(10,22,40,0.97)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: '#f8fafc' }}>{d.fullName}</div>
        <div style={{ color: '#94a3b8' }}>✅ Signed: <span style={{ color: '#10b981', fontWeight: 700 }}>{d.Signed}</span></div>
        <div style={{ color: '#94a3b8' }}>⏳ Unsigned: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{d.Unsigned}</span></div>
        <div style={{ color: '#94a3b8', marginTop: 4 }}>Conversion Rate: <span style={{ color: '#6366f1', fontWeight: 700 }}>{d.rate}%</span></div>
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ padding: '20px 16px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
        Signed vs Unsigned Retainers
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="agent" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
          <Legend formatter={(val) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{val}</span>} />
          <Bar dataKey="Signed" fill="#10b981" radius={[4, 4, 0, 0]} fillOpacity={0.85} />
          <Bar dataKey="Unsigned" fill="#f59e0b" radius={[4, 4, 0, 0]} fillOpacity={0.7} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
