'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Navigation from '@/components/Navigation'
import PersonalDashboard, { GoalSettings } from '@/components/PersonalDashboard'
import SummaryCards from '@/components/SummaryCards'
import Leaderboard from '@/components/Leaderboard'
import PerformanceLineChart from '@/components/charts/PerformanceLineChart'
import CAPDBarChart from '@/components/charts/CAPDBarChart'
import WeekdayHeatmap from '@/components/charts/WeekdayHeatmap'
import ConversionChart from '@/components/charts/ConversionChart'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'

const PRESETS = [
  { label: 'Last 7 days', getValue: () => ({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 30 days', getValue: () => ({ from: format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This month', getValue: () => ({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }) },
  { label: 'All time', getValue: () => ({ from: '2025-01-01', to: '2099-12-31' }) },
]

export default function DashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<any[]>([])
  const [goals, setGoals] = useState<GoalSettings | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [to, setTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [activePreset, setActivePreset] = useState('This month')

  const userRole = (session?.user as any)?.role || 'regular'
  const userName = session?.user?.name || ''

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/performance?from=${from}&to=${to}`)
      const json = await res.json()
      setData(Array.isArray(json) ? json : [])
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { fetchData() }, [fetchData])

  // Fetch goal settings once
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => setGoals({
        goal_signed_retainers: parseInt(s.goal_signed_retainers) || 35,
        goal_conversion_rate: parseInt(s.goal_conversion_rate) || 65,
        goal_avg_capd: parseInt(s.goal_avg_capd) || 40,
      }))
      .catch(() => {})
  }, [])

  function applyPreset(preset: typeof PRESETS[0]) {
    const vals = preset.getValue()
    setFrom(vals.from)
    setTo(vals.to)
    setActivePreset(preset.label)
  }

  const isRegular = userRole === 'regular'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Navigation />

      <main style={{
        marginLeft: 'var(--sidebar-width)',
        flex: 1,
        padding: '32px 28px',
        background: 'radial-gradient(ellipse at 70% 0%, rgba(99,102,241,0.06) 0%, transparent 50%), var(--bg-primary)',
        minHeight: '100vh',
      }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}>
            {isRegular ? 'My Dashboard' : 'Team Performance'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Veterans Benefits Division · Tabak LLC
          </p>
        </div>

        {/* Date filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              id={`preset-${preset.label.replace(/\s+/g, '-').toLowerCase()}`}
              className={activePreset === preset.label ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '7px 14px', fontSize: 13 }}
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <input
              id="date-from"
              type="date"
              className="input-field"
              style={{ width: 150 }}
              value={from}
              onChange={(e) => { setFrom(e.target.value); setActivePreset('Custom') }}
            />
            <span style={{ color: 'var(--text-muted)' }}>→</span>
            <input
              id="date-to"
              type="date"
              className="input-field"
              style={{ width: 150 }}
              value={to}
              onChange={(e) => { setTo(e.target.value); setActivePreset('Custom') }}
            />
            <button id="btn-refresh" className="btn-primary" style={{ padding: '8px 16px', fontSize: 13 }} onClick={fetchData}>
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-secondary)' }}>
            <span style={{ width: 24, height: 24, border: '3px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
            Loading performance data…
          </div>
        ) : data.length === 0 ? (
          <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No data for this period</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Try selecting a wider date range, or import your Excel file to load historical data.
            </p>
          </div>
        ) : (
          <>
            {/* ── Personal Dashboard (Regular users) ── */}
            {isRegular && userName && (
              <PersonalDashboard allData={data} agentName={userName} goals={goals} />
            )}

            {/* ── Section divider for regular users ── */}
            {isRegular && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Team Overview
                </span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            )}

            {/* ── Team Dashboard (always shown) ── */}
            <SummaryCards data={data} />

            {/* Charts Row 1 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 20 }}>
              <PerformanceLineChart
                data={data}
                metric="signed_retainers"
                title="Signed Retainers Over Time"
              />
              <ConversionChart data={data} />
            </div>

            {/* Charts Row 2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
              <CAPDBarChart data={data} />
              <WeekdayHeatmap data={data} />
            </div>

            {/* Leaderboard */}
            <div style={{ marginTop: 16 }}>
              <Leaderboard data={data} />
            </div>
          </>
        )}
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
