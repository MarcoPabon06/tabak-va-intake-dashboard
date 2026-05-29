'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'

interface Row {
  date: string
  agent_name: string
  signed_retainers: number
  unsigned_retainers: number
}

interface Props {
  data: Row[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function WeekdayHeatmap({ data }: Props) {
  // Calculate avg signed retainers per weekday
  const dayTotals: Record<number, { signed: number; days: Set<string> }> = {}
  for (let d = 0; d < 7; d++) dayTotals[d] = { signed: 0, days: new Set() }

  for (const row of data) {
    try {
      const d = new Date(row.date)
      const day = d.getDay()
      dayTotals[day].signed += row.signed_retainers || 0
      dayTotals[day].days.add(row.date)
    } catch {}
  }

  const chartData = DAYS.map((name, i) => {
    const t = dayTotals[i]
    const dayCount = t.days.size || 1
    return {
      day: name,
      avg_signed: parseFloat((t.signed / dayCount).toFixed(2)),
      total: t.signed,
      dayCount,
    }
  })

  const max = Math.max(...chartData.map((d) => d.avg_signed), 1)

  const getColor = (val: number) => {
    const ratio = val / max
    if (ratio >= 0.75) return '#10b981'
    if (ratio >= 0.5) return '#6366f1'
    if (ratio >= 0.25) return '#f59e0b'
    return '#475569'
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div style={{ background: 'rgba(10,22,40,0.97)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: '#f8fafc' }}>{d.day}</div>
        <div style={{ color: '#94a3b8' }}>Avg Signed: <span style={{ color: '#10b981', fontWeight: 700 }}>{d.avg_signed}</span></div>
        <div style={{ color: '#94a3b8' }}>Total Signed: <span style={{ fontWeight: 600 }}>{d.total}</span></div>
        <div style={{ color: '#94a3b8' }}>Days tracked: <span style={{ fontWeight: 600 }}>{d.dayCount}</span></div>
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ padding: '20px 16px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
        Avg Signed Retainers by Weekday
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)' }} />
          <Bar dataKey="avg_signed" radius={[6, 6, 0, 0]}>
            {chartData.map((entry) => (
              <Cell key={entry.day} fill={getColor(entry.avg_signed)} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {[{ color: '#10b981', label: 'High' }, { color: '#6366f1', label: 'Good' }, { color: '#f59e0b', label: 'Moderate' }, { color: '#475569', label: 'Low' }].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
