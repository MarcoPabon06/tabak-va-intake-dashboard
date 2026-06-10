'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import { computeBadges } from '@/lib/badges'
import BadgeShelf from '@/components/BadgeShelf'
import PersonalQA from '@/components/PersonalQA'

export interface GoalSettings {
  goal_signed_retainers?: number
  goal_conversion_rate?: number
  goal_avg_capd?: number
  // VA
  goal_signed_retainers_va?: number
  goal_conversion_rate_va?: number
  goal_avg_capd_va?: number
  // SSD
  goal_converted_cases_ssd?: number
  goal_conversion_rate_ssd?: number
  goal_avg_capd_ssd?: number
}

interface Row {
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

interface Props {
  allData: Row[]
  agentName: string
  goals?: GoalSettings
  lob?: string
}

function progressColor(pct: number) {
  if (pct >= 100) return '#10b981'
  if (pct >= 70) return '#6366f1'
  if (pct >= 40) return '#f59e0b'
  return '#ef4444'
}

export default function PersonalDashboard({ allData, agentName, goals, lob = 'VA' }: Props) {
  const isSSD = lob === 'SSD'
  const g = {
    goal_signed_retainers: isSSD
      ? (goals?.goal_converted_cases_ssd ?? goals?.goal_signed_retainers ?? 35)
      : (goals?.goal_signed_retainers_va ?? goals?.goal_signed_retainers ?? 35),
    goal_conversion_rate: isSSD
      ? (goals?.goal_conversion_rate_ssd ?? goals?.goal_conversion_rate ?? 65)
      : (goals?.goal_conversion_rate_va ?? goals?.goal_conversion_rate ?? 65),
    goal_avg_capd: isSSD
      ? (goals?.goal_avg_capd_ssd ?? goals?.goal_avg_capd ?? 40)
      : (goals?.goal_avg_capd_va ?? goals?.goal_avg_capd ?? 40),
  }
  const myData = allData.filter((r) => r.agent_name === agentName)

  // ── Totals ──
  const totalSigned = myData.reduce((s, r) => s + (r.signed_retainers || 0), 0)
  const totalUnsigned = myData.reduce((s, r) => s + (r.unsigned_retainers || 0), 0)
  const totalConverted = myData.reduce((s, r) => s + (r.converted_cases || 0), 0)
  const totalRfc = myData.reduce((s, r) => s + (r.rfc_sent || 0), 0)
  const totalCases = totalSigned + totalUnsigned
  
  const convRate = lob === 'SSD'
    ? (totalSigned > 0 ? (totalConverted / totalSigned) * 100 : 0)
    : (totalCases > 0 ? (totalSigned / totalCases) * 100 : 0)

  const totalCrh = myData.reduce((s, r) => s + (r.crh || 0), 0)
  const totalRejected = myData.reduce((s, r) => s + (r.case_rejected || 0), 0)
  const presentRows = myData.filter((r) => r.present === 'SI')
  const avgCapd = presentRows.length > 0
    ? Math.round(presentRows.reduce((s, r) => s + (r.capd || 0), 0) / presentRows.length)
    : 0
  const daysWorked = new Set(myData.map((r) => r.date)).size

  // ── Goals ──
  const primaryVolume = lob === 'SSD' ? totalConverted : totalSigned
  const signedPct = Math.min(Math.round((primaryVolume / (g.goal_signed_retainers || 35)) * 100), 150)
  const convPct = Math.min(Math.round((convRate / (g.goal_conversion_rate || 65)) * 100), 150)
  const capdPct = Math.min(Math.round((avgCapd / (g.goal_avg_capd || 40)) * 100), 150)

  // ── Ranking ──
  const rankingMetric = lob === 'SSD' ? 'converted_cases' : 'signed_retainers'
  const agentTotals: Record<string, number> = {}
  for (const r of allData) {
    agentTotals[r.agent_name] = (agentTotals[r.agent_name] || 0) + (r[rankingMetric] || 0)
  }
  const sorted = Object.entries(agentTotals).sort((a, b) => b[1] - a[1])
  const myRank = sorted.findIndex(([n]) => n === agentName) + 1
  const totalAgents = sorted.length

  // ── Daily trend (for mini chart) ──
  const byDate: Record<string, { signed: number; capd: number; converted: number }> = {}
  for (const r of myData) {
    if (!byDate[r.date]) byDate[r.date] = { signed: 0, capd: 0, converted: 0 }
    byDate[r.date].signed += r.signed_retainers || 0
    byDate[r.date].capd += r.capd || 0
    byDate[r.date].converted += r.converted_cases || 0
  }
  const trendData = Object.entries(byDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({
      date: date.slice(5), // MM-DD
      signed: vals.signed,
      capd: vals.capd,
      converted: vals.converted,
    }))

  // ── Weekly comparison ──
  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay() + 1) // Monday
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)
  const thisWeekStr = thisWeekStart.toISOString().slice(0, 10)
  const lastWeekStr = lastWeekStart.toISOString().slice(0, 10)

  const thisWeekVal = myData
    .filter((r) => r.date >= thisWeekStr)
    .reduce((s, r) => s + (r[rankingMetric] || 0), 0)
  const lastWeekVal = myData
    .filter((r) => r.date >= lastWeekStr && r.date < thisWeekStr)
    .reduce((s, r) => s + (r[rankingMetric] || 0), 0)
  const weekDiff = thisWeekVal - lastWeekVal

  // ── Streak ──
  const uniqueDates = [...new Set(myData.filter((r) => (r[rankingMetric] || 0) > 0).map((r) => r.date))].sort().reverse()
  let streak = 0
  const today = new Date()
  const checkDate = new Date(today)
  for (let i = 0; i < 60; i++) {
    const ds = checkDate.toISOString().slice(0, 10)
    const dow = checkDate.getDay()
    if (dow === 0 || dow === 6) { checkDate.setDate(checkDate.getDate() - 1); continue }
    if (uniqueDates.includes(ds)) { streak++; checkDate.setDate(checkDate.getDate() - 1) }
    else break
  }

  // ── No data ──
  if (myData.length === 0) {
    return (
      <div className="glass-card" style={{ padding: 40, textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Welcome, {agentName.split(' ')[0]}!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          No performance data found for this period yet. Your stats will appear here once your admin enters your daily numbers.
        </p>
      </div>
    )
  }

  const streakLabel = lob === 'SSD' ? 'conversion streak' : 'signing streak'

  const goalCards = [
    { label: lob === 'SSD' ? 'Converted Cases' : 'Signed Retainers', value: primaryVolume, goal: g.goal_signed_retainers, pct: signedPct, icon: lob === 'SSD' ? '💼' : '✅', unit: '' },
    { label: 'Conversion Rate', value: convRate.toFixed(1), goal: g.goal_conversion_rate, pct: convPct, icon: '📈', unit: '%' },
    { label: 'Avg CAPD', value: avgCapd, goal: g.goal_avg_capd, pct: capdPct, icon: '📞', unit: '' },
  ]

  const kpiCards = lob === 'SSD' ? [
    { label: 'Total Converted', value: totalConverted, color: '#10b981', icon: '💼' },
    { label: 'Total Signed', value: totalSigned, color: '#3b82f6', icon: '✅' },
    { label: 'Conversion Rate', value: `${convRate.toFixed(1)}%`, color: '#6366f1', icon: '📈' },
    { label: 'Avg CAPD', value: avgCapd, color: avgCapd >= (g.goal_avg_capd || 40) ? '#10b981' : '#f59e0b', icon: '📞' },
    { label: 'RFC Sent', value: totalRfc, color: '#ec4899', icon: '📄' },
    { label: 'CRH', value: totalCrh, color: '#ef4444', icon: '🚫' },
    { label: 'Rejected', value: totalRejected, color: '#94a3b8', icon: '❌' },
  ] : [
    { label: 'Total Signed', value: totalSigned, color: '#10b981', icon: '✅' },
    { label: 'Total Unsigned', value: totalUnsigned, color: '#f59e0b', icon: '⏳' },
    { label: 'Conversion Rate', value: `${convRate.toFixed(1)}%`, color: '#6366f1', icon: '📈' },
    { label: 'Avg CAPD', value: avgCapd, color: avgCapd >= (g.goal_avg_capd || 40) ? '#10b981' : '#f59e0b', icon: '📞' },
    { label: 'CRH', value: totalCrh, color: '#ef4444', icon: '🚫' },
    { label: 'Rejected', value: totalRejected, color: '#94a3b8', icon: '❌' },
  ]

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Welcome banner */}
      <div className="glass-card fade-in" style={{
        padding: '24px 28px',
        marginBottom: 16,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(16,185,129,0.08) 100%)',
        borderColor: 'rgba(99,102,241,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
              Welcome back, {agentName.split(' ')[0]}! 👋
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {daysWorked} day{daysWorked !== 1 ? 's' : ''} tracked this period
              {streak > 0 && (
                <span style={{ marginLeft: 12, color: '#f59e0b', fontWeight: 600 }}>
                  🔥 {streak}-day {streakLabel}
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {/* Ranking badge */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              padding: '10px 16px', borderRadius: 12,
              background: myRank === 1 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${myRank === 1 ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
            }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: myRank === 1 ? '#f59e0b' : myRank <= 3 ? '#6366f1' : 'var(--text-primary)' }}>
                #{myRank}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>of {totalAgents}</span>
            </div>
            {/* Week comparison */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 2 }}>This week</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{thisWeekVal}</div>
              <div style={{ fontSize: 11, color: weekDiff >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                {weekDiff >= 0 ? '▲' : '▼'} {Math.abs(weekDiff)} vs last week
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Achievement Badges */}
      <BadgeShelf badges={computeBadges(allData, agentName)} />

      {/* QA Score Summary */}
      <PersonalQA agentName={agentName} />

      {/* Goal Progress Bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
        {goalCards.map((g) => (
          <div key={g.label} className="glass-card fade-in" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{g.icon} {g.label}</span>
              <span style={{ fontSize: 12, color: progressColor(g.pct), fontWeight: 700 }}>
                {g.pct >= 100 ? '✓ Goal met!' : `${g.pct}%`}
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: progressColor(g.pct), marginBottom: 6 }}>
              {g.value}{g.unit}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Goal: {g.goal}{g.unit}
            </div>
            {/* Progress bar */}
            <div style={{
              height: 8, borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(g.pct, 100)}%`,
                borderRadius: 4,
                background: `linear-gradient(90deg, ${progressColor(g.pct)}cc, ${progressColor(g.pct)})`,
                transition: 'width 0.8s cubic-bezier(0.25,0.46,0.45,0.94)',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Personal KPI Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${kpiCards.length}, 1fr)`,
        gap: 14,
        marginBottom: 16,
        overflowX: 'auto',
      }}>
        {kpiCards.map((c) => (
          <div key={c.label} className="glass-card fade-in" style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 120 }}>
            <div style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: '50%', background: `radial-gradient(circle, ${c.color}15 0%, transparent 70%)`, pointerEvents: 'none' }} />
            <span style={{ fontSize: 18, display: 'block', marginBottom: 8 }}>{c.icon}</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color, lineHeight: 1, marginBottom: 4 }}>{c.value}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Personal Signed Trend + CAPD chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="glass-card" style={{ padding: '20px 16px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            My {lob === 'SSD' ? 'Converted Cases' : 'Signed Retainers'} Trend
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={lob === 'SSD' ? '#10b981' : '#3b82f6'} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={lob === 'SSD' ? '#10b981' : '#3b82f6'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(10,22,40,0.97)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, fontSize: 13 }}
                labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
              />
              <Area type="monotone" dataKey={lob === 'SSD' ? 'converted' : 'signed'} stroke={lob === 'SSD' ? '#10b981' : '#3b82f6'} fill="url(#trendGrad)" strokeWidth={2} name={lob === 'SSD' ? 'Converted' : 'Signed'} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card" style={{ padding: '20px 16px' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            My Daily CAPD
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: 'rgba(10,22,40,0.97)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, fontSize: 13 }}
                labelStyle={{ color: '#f8fafc', fontWeight: 700 }}
              />
              <Bar dataKey="capd" radius={[4, 4, 0, 0]} name="CAPD">
                {trendData.map((entry, i) => (
                  <Cell key={i} fill={entry.capd >= (g.goal_avg_capd || 40) ? '#10b981' : '#f59e0b'} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
