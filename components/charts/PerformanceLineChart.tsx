'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO } from 'date-fns'

const AGENT_COLORS: Record<string, string> = {
  'Daniel Castillo': '#b82105',
  'Adriana Soto': '#ec4899',
  'Oliver Ortega': '#10b981',
  'Alejandra NicoleReyes': '#f59e0b',
  'Omar Soto': '#3b82f6',
}

const ALL_COLORS = ['#b82105', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#06b6d4', '#5f758e', '#f97316']

interface Row {
  date: string
  agent_name: string
  signed_retainers: number
  unsigned_retainers: number
  converted_cases?: number
  rfc_sent?: number
  total_case_wanted: number
}

interface Props {
  data: Row[]
  metric: 'signed_retainers' | 'total_case_wanted' | 'unsigned_retainers' | 'converted_cases'
  title: string
}

export default function PerformanceLineChart({ data, metric, title }: Props) {
  // Group by date, pivot agents as columns
  const agents = [...new Set(data.map((r) => r.agent_name))].sort()
  const byDate: Record<string, Record<string, number>> = {}

  for (const row of data) {
    if (!byDate[row.date]) byDate[row.date] = {}
    byDate[row.date][row.agent_name] = (byDate[row.date][row.agent_name] || 0) + (row[metric] || 0)
  }

  const chartData = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      label: (() => {
        try { return format(parseISO(date), 'MMM d') } catch { return date }
      })(),
      ...vals,
    }))

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{
        background: 'rgba(10,22,40,0.97)',
        border: '1px solid rgba(184, 33, 5, 0.3)',
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: '#94a3b8' }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block' }} />
            <span style={{ color: '#94a3b8' }}>{p.dataKey}:</span>
            <span style={{ fontWeight: 600, color: p.color }}>{p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="glass-card" style={{ padding: '20px 16px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="label" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
          />
          {agents.map((agent, i) => (
            <Line
              key={agent}
              type="monotone"
              dataKey={agent}
              stroke={AGENT_COLORS[agent] || ALL_COLORS[i % ALL_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
